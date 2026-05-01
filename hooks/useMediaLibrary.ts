import { useState, useCallback, useRef } from "react";
import { Dimensions, PixelRatio, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

/** iOS 14+ returns `limited`; TS enum in expo-modules-core omits it. */
export function hasPhotoLibraryAccess(
  status: MediaLibrary.PermissionStatus | null | undefined
): boolean {
  return status === "granted" || (status as string) === "limited";
}

export type PhotoLibraryAccessPrivileges = "all" | "limited" | "none" | null;

function parseAccessPrivileges(
  response: MediaLibrary.PermissionResponse & {
    accessPrivileges?: "all" | "limited" | "none";
  }
): PhotoLibraryAccessPrivileges {
  return response.accessPrivileges ?? null;
}

/**
 * Random photo roll and broad library queries need **all** photos on iOS.
 * `limited` (selected photos only) is treated as insufficient.
 */
export function hasFullPhotoLibraryAccess(
  status: MediaLibrary.PermissionStatus | null | undefined,
  accessPrivileges: PhotoLibraryAccessPrivileges
): boolean {
  if (!hasPhotoLibraryAccess(status)) return false;
  if ((status as string) === "limited") return false;
  if (Platform.OS === "android") return true;
  if (accessPrivileges === "limited") return false;
  return true;
}

export interface MediaAsset {
  id: string;
  uri: string;
  creationTime: number;
  mediaType: "photo" | "video";
  width: number;
  height: number;
}

function mapExpoAsset(a: MediaLibrary.Asset): MediaAsset {
  return {
    id: a.id,
    uri: a.uri,
    creationTime: a.creationTime,
    mediaType: "photo",
    width: a.width,
    height: a.height,
  };
}

/* ── Camera-only filtering ─────────────────────────────────────────────── */

const SCREEN = Dimensions.get("screen");
const PX_SCALE = PixelRatio.get();
const SCREEN_PX_W = Math.round(SCREEN.width * PX_SCALE);
const SCREEN_PX_H = Math.round(SCREEN.height * PX_SCALE);

function isScreenshotDimensions(w: number, h: number): boolean {
  return (
    (w === SCREEN_PX_W && h === SCREEN_PX_H) ||
    (w === SCREEN_PX_H && h === SCREEN_PX_W)
  );
}

let _excludedIds: Set<string> | null = null;
let _excludedIdsPromise: Promise<Set<string>> | null = null;

const EXCLUDED_ALBUM_RE =
  /screenshot|whatsapp|telegram|messenger|signal|viber|wechat|snapchat/i;

async function loadExcludedAssetIds(): Promise<Set<string>> {
  if (_excludedIds) return _excludedIds;
  if (_excludedIdsPromise) return _excludedIdsPromise;

  _excludedIdsPromise = (async () => {
    const ids = new Set<string>();
    try {
      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });
      const toExclude = albums.filter((a) =>
        EXCLUDED_ALBUM_RE.test(a.title.trim())
      );

      for (const album of toExclude) {
        let cursor: string | undefined;
        let hasMore = true;
        while (hasMore) {
          const page = await MediaLibrary.getAssetsAsync({
            album,
            mediaType: [MediaLibrary.MediaType.photo],
            first: 2000,
            ...(cursor ? { after: cursor } : {}),
          });
          for (const a of page.assets) ids.add(a.id);
          hasMore = page.hasNextPage;
          cursor = page.endCursor;
        }
      }
    } catch {
      // fail open — show all photos rather than crash
    }
    _excludedIds = ids;
    _excludedIdsPromise = null;
    return ids;
  })();

  return _excludedIdsPromise;
}

function isCameraPhoto(
  asset: { id: string; width: number; height: number; mediaSubtypes?: string[] },
  excludedIds: Set<string>
): boolean {
  if (excludedIds.has(asset.id)) return false;
  if (asset.mediaSubtypes?.includes("screenshot")) return false;
  if (isScreenshotDimensions(asset.width, asset.height)) return false;
  return true;
}

/* ── Photo queries ─────────────────────────────────────────────────────── */

const REWIND_PHOTO_QUERY: Pick<
  MediaLibrary.AssetsOptions,
  "mediaType" | "sortBy"
> = {
  mediaType: [MediaLibrary.MediaType.photo],
  sortBy: [MediaLibrary.SortBy.creationTime],
};

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
let _nextPickRecent = Math.random() < 0.5;

async function pickRandomAssetFromBucket(
  timeFilter: Partial<MediaLibrary.AssetsOptions>
): Promise<MediaLibrary.Asset | null> {
  const pageSize = 400;
  const first = await MediaLibrary.getAssetsAsync({
    ...REWIND_PHOTO_QUERY,
    ...timeFilter,
    first: pageSize,
  });
  const total = first.totalCount;
  if (total === 0 || first.assets.length === 0) return null;

  const r = Math.min(
    Math.floor(Math.random() * total),
    Math.max(0, total - 1)
  );

  if (r < first.assets.length) {
    return first.assets[r];
  }

  let offset = first.assets.length;
  let cursor: string | undefined = first.endCursor;

  while (r >= offset && cursor) {
    const page = await MediaLibrary.getAssetsAsync({
      ...REWIND_PHOTO_QUERY,
      ...timeFilter,
      first: pageSize,
      after: cursor,
    });
    if (page.assets.length === 0) break;
    if (r < offset + page.assets.length) {
      return page.assets[r - offset];
    }
    offset += page.assets.length;
    cursor = page.hasNextPage ? page.endCursor : undefined;
  }

  return first.assets[first.assets.length - 1];
}

async function pickRandomAssetRaw(): Promise<MediaLibrary.Asset | null> {
  const pickRecent = _nextPickRecent;
  _nextPickRecent = !_nextPickRecent;

  const sixMonthsAgo = Date.now() - SIX_MONTHS_MS;
  const primary = pickRecent
    ? { createdAfter: sixMonthsAgo }
    : { createdBefore: sixMonthsAgo };
  const fallback = pickRecent
    ? { createdBefore: sixMonthsAgo }
    : { createdAfter: sixMonthsAgo };

  return (
    (await pickRandomAssetFromBucket(primary)) ??
    (await pickRandomAssetFromBucket(fallback))
  );
}

/**
 * Picks a uniformly random camera photo from the library,
 * skipping screenshots and images from messaging apps.
 */
export async function pickRandomPhotoFromLibrary(): Promise<MediaAsset | null> {
  const excludedIds = await loadExcludedAssetIds();
  const maxAttempts = 12;

  for (let i = 0; i < maxAttempts; i++) {
    const raw = await pickRandomAssetRaw();
    if (!raw) return null;
    if (isCameraPhoto(raw, excludedIds)) return mapExpoAsset(raw);
  }
  return null;
}

/** Insert or locate asset in a list sorted by creationTime descending (newest first). */
export function mergePhotoIntoSortedDesc(
  photos: MediaAsset[],
  asset: MediaAsset
): { photos: MediaAsset[]; index: number } {
  const existing = photos.findIndex((p) => p.id === asset.id);
  if (existing >= 0) {
    return { photos, index: existing };
  }
  let i = 0;
  while (i < photos.length && photos[i].creationTime >= asset.creationTime) {
    i++;
  }
  return {
    photos: [...photos.slice(0, i), asset, ...photos.slice(i)],
    index: i,
  };
}

/* ── Photo index (pre-loaded for instant random picks) ──────────────────── */

interface PhotoIndex {
  recent: MediaAsset[];
  older: MediaAsset[];
}

let _photoIndex: PhotoIndex | null = null;
let _photoIndexPromise: Promise<PhotoIndex> | null = null;

async function buildPhotoIndex(): Promise<PhotoIndex> {
  if (_photoIndex) return _photoIndex;
  if (_photoIndexPromise) return _photoIndexPromise;

  _photoIndexPromise = (async () => {
    const excludedIds = await loadExcludedAssetIds();
    const sixMonthsAgo = Date.now() - SIX_MONTHS_MS;
    const recent: MediaAsset[] = [];
    const older: MediaAsset[] = [];

    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const opts: MediaLibrary.AssetsOptions = {
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [MediaLibrary.SortBy.creationTime],
        first: 1000,
      };
      if (cursor) opts.after = cursor;
      const page = await MediaLibrary.getAssetsAsync(opts);

      for (const a of page.assets) {
        if (!isCameraPhoto(a, excludedIds)) continue;
        const mapped = mapExpoAsset(a);
        if (a.creationTime >= sixMonthsAgo) {
          recent.push(mapped);
        } else {
          older.push(mapped);
        }
      }

      hasMore = page.hasNextPage;
      cursor = page.endCursor;
    }

    console.log(
      `[useMediaLibrary] photo index built: ${recent.length} recent, ${older.length} older`
    );
    _photoIndex = { recent, older };
    _photoIndexPromise = null;
    return _photoIndex;
  })();

  return _photoIndexPromise;
}

function pickFromIndex(index: PhotoIndex): MediaAsset | null {
  const pickRecent = _nextPickRecent;
  _nextPickRecent = !_nextPickRecent;

  const primary = pickRecent ? index.recent : index.older;
  const fallback = pickRecent ? index.older : index.recent;
  const source = primary.length > 0 ? primary : fallback;

  if (source.length === 0) return null;
  return source[Math.floor(Math.random() * source.length)];
}

/* ── URI resolution (ph:// → file://) ──────────────────────────────────── */

const _timeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

async function resolveToFileUri(asset: MediaAsset): Promise<MediaAsset> {
  try {
    const manipulated = await _timeout(
      manipulateAsync(asset.uri, [], { compress: 0.85, format: SaveFormat.JPEG }),
      5000
    );
    if (manipulated?.uri) return { ...asset, uri: manipulated.uri };
  } catch {}

  try {
    const info = await _timeout(MediaLibrary.getAssetInfoAsync(asset.id), 8000);
    if (info?.localUri) return { ...asset, uri: info.localUri };
  } catch {}

  return asset;
}

/* ── Pre-buffer (resolve photos ahead of time for instant shuffle) ────── */

const BUFFER_TARGET = 3;
const _preBuffer: MediaAsset[] = [];
let _isPreBuffering = false;

async function fillPreBuffer(): Promise<void> {
  if (_isPreBuffering || _preBuffer.length >= BUFFER_TARGET) return;
  _isPreBuffering = true;

  try {
    while (_preBuffer.length < BUFFER_TARGET) {
      const raw = _photoIndex
        ? pickFromIndex(_photoIndex)
        : await pickRandomPhotoFromLibrary();
      if (!raw) break;
      const resolved = await resolveToFileUri(raw);
      _preBuffer.push(resolved);
    }
  } finally {
    _isPreBuffering = false;
  }
}

/** Eagerly start building the photo index and pre-buffer. */
export function warmUpPhotoCache(): void {
  void buildPhotoIndex().then(() => void fillPreBuffer());
}

/* ── Hook ───────────────────────────────────────────────────────────────── */

export function useMediaLibrary() {
  const [permissionStatus, setPermissionStatus] =
    useState<MediaLibrary.PermissionStatus | null>(null);
  const [accessPrivileges, setAccessPrivileges] =
    useState<PhotoLibraryAccessPrivileges>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const allPhotosCache = useRef<MediaAsset[]>([]);

  const requestPermission = useCallback(async () => {
    const response = await MediaLibrary.requestPermissionsAsync();
    const ap = parseAccessPrivileges(
      response as MediaLibrary.PermissionResponse & {
        accessPrivileges?: "all" | "limited" | "none";
      }
    );
    setPermissionStatus(response.status);
    setAccessPrivileges(ap);
    if (hasPhotoLibraryAccess(response.status)) warmUpPhotoCache();
    return hasFullPhotoLibraryAccess(response.status, ap);
  }, []);

  const checkPermission = useCallback(async () => {
    const response = await MediaLibrary.getPermissionsAsync();
    const ap = parseAccessPrivileges(
      response as MediaLibrary.PermissionResponse & {
        accessPrivileges?: "all" | "limited" | "none";
      }
    );
    setPermissionStatus(response.status);
    setAccessPrivileges(ap);
    if (hasPhotoLibraryAccess(response.status)) warmUpPhotoCache();
    return hasFullPhotoLibraryAccess(response.status, ap);
  }, []);

  const fetchAllPhotos = useCallback(async () => {
    if (allPhotosCache.current.length > 0) return allPhotosCache.current;

    setIsLoading(true);

    const [result, excludedIds] = await Promise.all([
      MediaLibrary.getAssetsAsync({
        mediaType: [MediaLibrary.MediaType.photo],
        first: 1000,
        sortBy: [MediaLibrary.SortBy.creationTime],
      }),
      loadExcludedAssetIds(),
    ]);

    const mapped: MediaAsset[] = result.assets
      .filter((a) => isCameraPhoto(a, excludedIds))
      .map(mapExpoAsset);

    allPhotosCache.current = mapped;
    setAssets(mapped);
    setIsLoading(false);
    return mapped;
  }, []);

  const fetchAssetsByDate = useCallback(
    async (date: Date) => {
      setIsLoading(true);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const [result, excludedIds] = await Promise.all([
        MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo],
          createdAfter: startOfDay.getTime(),
          createdBefore: endOfDay.getTime(),
          first: 100,
          sortBy: [MediaLibrary.SortBy.creationTime],
        }),
        loadExcludedAssetIds(),
      ]);

      const mapped: MediaAsset[] = result.assets
        .filter((a) => isCameraPhoto(a, excludedIds))
        .map(mapExpoAsset);
      setAssets(mapped);
      setIsLoading(false);
      return mapped;
    },
    []
  );

  const fetchAssetsByYear = useCallback(
    async (year: number) => {
      setIsLoading(true);
      const startDate = new Date(year, 0, 1).getTime();
      const endDate = new Date(year + 1, 0, 1).getTime();

      const [result, excludedIds] = await Promise.all([
        MediaLibrary.getAssetsAsync({
          mediaType: [MediaLibrary.MediaType.photo],
          createdAfter: startDate,
          createdBefore: endDate,
          first: 100,
          sortBy: [MediaLibrary.SortBy.creationTime],
        }),
        loadExcludedAssetIds(),
      ]);

      const mapped: MediaAsset[] = result.assets
        .filter((a) => isCameraPhoto(a, excludedIds))
        .map(mapExpoAsset);
      setAssets(mapped);
      setIsLoading(false);
      return mapped;
    },
    []
  );

  const getRandomAsset = useCallback(async (): Promise<MediaAsset | null> => {
    // Instant: serve from pre-buffer
    if (_preBuffer.length > 0) {
      const asset = _preBuffer.shift()!;
      console.log("[useMediaLibrary] served from buffer:", asset.id);
      void fillPreBuffer();
      return asset;
    }

    // Fast: pick from in-memory index, then resolve URI
    if (_photoIndex) {
      const raw = pickFromIndex(_photoIndex);
      if (raw) {
        console.log("[useMediaLibrary] picked from index:", raw.id);
        const resolved = await resolveToFileUri(raw);
        void fillPreBuffer();
        return resolved;
      }
    }

    // Fallback: original query-based approach
    const raw = await _timeout(pickRandomPhotoFromLibrary(), 8000);
    if (!raw) {
      console.log("[useMediaLibrary] pickRandomPhoto returned null");
      return null;
    }
    console.log("[useMediaLibrary] picked via query fallback:", raw.id);
    const resolved = await resolveToFileUri(raw);
    void fillPreBuffer();
    return resolved;
  }, []);

  return {
    permissionStatus,
    accessPrivileges,
    assets,
    isLoading,
    requestPermission,
    checkPermission,
    fetchAllPhotos,
    fetchAssetsByDate,
    fetchAssetsByYear,
    getRandomAsset,
  };
}
