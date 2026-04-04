import { useState, useCallback, useRef } from "react";
import { Dimensions, PixelRatio } from "react-native";
import * as MediaLibrary from "expo-media-library";

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
  /^(screenshots|whatsapp|telegram|messenger|signal|viber|line|wechat|snapchat)$/i;

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
        let after: string | undefined;
        let hasNext = true;
        while (hasNext) {
          const page = await MediaLibrary.getAssetsAsync({
            album,
            mediaType: [MediaLibrary.MediaType.photo],
            first: 500,
            ...(after ? { after } : {}),
          });
          for (const a of page.assets) ids.add(a.id);
          hasNext = page.hasNextPage;
          after = page.hasNextPage ? page.endCursor : undefined;
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
  asset: { id: string; width: number; height: number },
  excludedIds: Set<string>
): boolean {
  if (excludedIds.has(asset.id)) return false;
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

async function pickRandomAssetRaw(): Promise<MediaLibrary.Asset | null> {
  const pageSize = 400;
  const first = await MediaLibrary.getAssetsAsync({
    ...REWIND_PHOTO_QUERY,
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

export function useMediaLibrary() {
  const [permissionStatus, setPermissionStatus] =
    useState<MediaLibrary.PermissionStatus | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const allPhotosCache = useRef<MediaAsset[]>([]);

  const requestPermission = useCallback(async () => {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    setPermissionStatus(status);
    return status === "granted";
  }, []);

  const checkPermission = useCallback(async () => {
    const { status } = await MediaLibrary.getPermissionsAsync();
    setPermissionStatus(status);
    return status === "granted";
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
    return pickRandomPhotoFromLibrary();
  }, []);

  return {
    permissionStatus,
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
