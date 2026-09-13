import { useState, useCallback, useRef } from "react";
import { Dimensions, PixelRatio, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import * as FileSystem from "expo-file-system/legacy";
import { findFavoritesAlbum } from "@/lib/favoritesAlbum";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  PHOTO_BUCKET_CYCLE,
} from "@/lib/photoBucket";
import {
  peekVideoPosterUri,
  prefetchVideoPosterUri,
  resolveVideoPosterUri,
} from "@/lib/videoPoster";

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

export type PhotoSelectionPath = "buffer" | "index" | "query_fallback";

export interface PickedPhoto {
  asset: MediaAsset;
  /** Recency bucket the photo was picked from. */
  bucket: PhotoBucket;
  /** Where the picker found the photo — useful for telemetry sanity checks. */
  selectionPath: PhotoSelectionPath;
}

function mapExpoAsset(a: MediaLibrary.Asset): MediaAsset {
  const mediaType: "photo" | "video" =
    (a as unknown as { mediaType?: string }).mediaType === "video"
      ? "video"
      : "photo";
  return {
    id: a.id,
    uri: a.uri,
    creationTime: a.creationTime,
    mediaType,
    width: a.width,
    height: a.height,
  };
}

/** URIs that expo-video and upload paths can read reliably. */
export function isPlayableMediaUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return (
    uri.startsWith("file://") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://")
  );
}

const libraryVideoCache = new Map<string, string>();

/**
 * iOS returns video `localUri`s with a trailing `#<base64 bplist>` fragment
 * (spatial-video "RecommendedForImmersiveMode" metadata). AVFoundation and
 * expo-video-thumbnails fail to open the file when the fragment is present —
 * strip everything from `#` onward before touching the file system.
 */
export function stripUriFragment(uri: string): string {
  const hash = uri.indexOf("#");
  return hash === -1 ? uri : uri.slice(0, hash);
}

/** True when the file already lives in our own sandbox (safe to play directly). */
function isAppSandboxFile(uri: string): boolean {
  const cache = FileSystem.cacheDirectory;
  const docs = FileSystem.documentDirectory;
  return (
    (!!cache && uri.startsWith(cache)) || (!!docs && uri.startsWith(docs))
  );
}

/**
 * Copy Photos library video URIs (`ph://`, `assets-library://`, or raw
 * `/var/mobile/Media/...` paths) into `FileSystem.cacheDirectory` so expo-video
 * can play them on physical devices. Raw Photos paths are sandbox-protected and
 * cannot be opened directly by AVFoundation in production builds.
 */
async function ensureCachedLibraryVideoFile(
  sourceUri: string,
  cacheKey: string,
  fallbackUri?: string
): Promise<string | null> {
  const cleanSource = stripUriFragment(sourceUri);

  // Reuse if it's already a playable copy inside our own sandbox. We must NOT
  // short-circuit for raw Photos paths — those throw "permission" on device.
  if (cleanSource.startsWith("file://") && isAppSandboxFile(cleanSource)) {
    try {
      const info = await FileSystem.getInfoAsync(cleanSource);
      if (info.exists && (info.size ?? 0) > 0) return cleanSource;
    } catch {
      /* fall through to copy */
    }
  }

  const cached = libraryVideoCache.get(cacheKey);
  if (cached) {
    try {
      const info = await FileSystem.getInfoAsync(cached);
      if (info.exists && (info.size ?? 0) > 0) return cached;
    } catch {
      libraryVideoCache.delete(cacheKey);
    }
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return null;
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dest = `${cacheDir}lm-lib-vid-${safeKey}.mp4`;

  // Try the resolved local path first, then the original `ph://` URI which the
  // Photos framework can always read via expo-file-system.
  const candidates = [
    cleanSource,
    fallbackUri ? stripUriFragment(fallbackUri) : null,
  ].filter((u): u is string => !!u && u !== "");

  for (const from of candidates) {
    try {
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch {
        /* no stale file */
      }
      await FileSystem.copyAsync({ from, to: dest });
      const info = await FileSystem.getInfoAsync(dest);
      if (info.exists && (info.size ?? 0) > 0) {
        libraryVideoCache.set(cacheKey, dest);
        return dest;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
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

/**
 * Modern phone screens are far taller than any camera sensor produces
 * (square=1.0, 4:3=1.33, 3:2=1.5, 16:9=1.78). A full-screen grab keeps that
 * tall ratio even after a messaging app downscales/recompresses it, so a
 * still whose long:short ratio lands in the phone-screen band (~18:9 to 20:9)
 * is almost certainly a screenshot — even when it arrived via WhatsApp from
 * another device and so carries no Screenshots-album membership, no
 * `screenshot` mediaSubtype, and foreign dimensions. Panoramas are
 * proportionally wider (ratio above the band) and pass through untouched.
 */
const PHONE_SCREEN_ASPECT_MIN = 1.95;
const PHONE_SCREEN_ASPECT_MAX = 2.28;

function isPhoneScreenAspect(w: number, h: number): boolean {
  if (w <= 0 || h <= 0) return false;
  const ratio = Math.max(w, h) / Math.min(w, h);
  return ratio >= PHONE_SCREEN_ASPECT_MIN && ratio <= PHONE_SCREEN_ASPECT_MAX;
}

interface ExcludedAssetIds {
  /** Assets known to be screenshots (from a Screenshots album). */
  screenshotIds: Set<string>;
  /** Assets received via a messaging-app album (WhatsApp, Telegram, etc). */
  messagingAppIds: Set<string>;
}

let _excludedIds: ExcludedAssetIds | null = null;
let _excludedIdsPromise: Promise<ExcludedAssetIds> | null = null;

const SCREENSHOT_ALBUM_RE = /screenshot|screen\s*shot/i;
const MESSAGING_APP_ALBUM_RE =
  /whatsapp|whats\s*app|wa\s+images|telegram|messenger|signal|viber|wechat|snapchat/i;
const SCREENSHOT_FILENAME_RE = /screenshot|screen[-_ ]?shot/i;
const MESSAGING_APP_FILENAME_RE = /img-?wa-|\bwa\d{4,}|whatsapp|_chat\.|inline\.png/i;

async function loadExcludedAssetIds(): Promise<ExcludedAssetIds> {
  if (_excludedIds) return _excludedIds;
  if (_excludedIdsPromise) return _excludedIdsPromise;

  _excludedIdsPromise = (async () => {
    const screenshotIds = new Set<string>();
    const messagingAppIds = new Set<string>();
    try {
      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });

      for (const album of albums) {
        const title = album.title.trim();
        const isScreenshotAlbum = SCREENSHOT_ALBUM_RE.test(title);
        const isMessagingAlbum =
          !isScreenshotAlbum && MESSAGING_APP_ALBUM_RE.test(title);
        if (!isScreenshotAlbum && !isMessagingAlbum) continue;

        const targetSet = isScreenshotAlbum ? screenshotIds : messagingAppIds;
        let cursor: string | undefined;
        let hasMore = true;
        while (hasMore) {
          const page = await MediaLibrary.getAssetsAsync({
            album,
            mediaType: [MediaLibrary.MediaType.photo],
            first: 2000,
            ...(cursor ? { after: cursor } : {}),
          });
          for (const a of page.assets) targetSet.add(a.id);
          hasMore = page.hasNextPage;
          cursor = page.endCursor;
        }
      }
    } catch {
      // fail open — show all photos rather than crash
    }
    _excludedIds = { screenshotIds, messagingAppIds };
    _excludedIdsPromise = null;
    return _excludedIds;
  })();

  return _excludedIdsPromise;
}

function isScreenshotAsset(
  asset: { id: string; width: number; height: number; mediaSubtypes?: string[] },
  screenshotIds: Set<string>,
  opts?: { filename?: string | null }
): boolean {
  if (screenshotIds.has(asset.id)) return true;
  if (asset.mediaSubtypes?.includes("screenshot")) return true;
  const fn = opts?.filename?.toLowerCase() ?? "";
  if (fn && SCREENSHOT_FILENAME_RE.test(fn)) return true;
  if (isScreenshotDimensions(asset.width, asset.height)) return true;
  if (isPhoneScreenAspect(asset.width, asset.height)) return true;
  return false;
}

function isMessagingAppAsset(
  asset: { id: string },
  messagingAppIds: Set<string>,
  opts?: { filename?: string | null }
): boolean {
  if (messagingAppIds.has(asset.id)) return true;
  const fn = opts?.filename?.toLowerCase() ?? "";
  if (fn && MESSAGING_APP_FILENAME_RE.test(fn)) return true;
  return false;
}

/**
 * "Camera-only" predicate used by random rewind/throwback picks — excludes
 * both screenshots and images received through messaging apps so old WhatsApp
 * memes never surface as a memory.
 */
function isCameraPhoto(
  asset: { id: string; width: number; height: number; mediaSubtypes?: string[] },
  excluded: ExcludedAssetIds,
  opts?: { filename?: string | null }
): boolean {
  if (isScreenshotAsset(asset, excluded.screenshotIds, opts)) return false;
  if (isMessagingAppAsset(asset, excluded.messagingAppIds, opts)) return false;
  return true;
}

/**
 * Day-capture predicate used by the day-range carousel — only screenshots are
 * filtered out, so photos received via text / WhatsApp / other messengers on
 * that day are still selectable.
 */
function isDayCapturePhoto(
  asset: { id: string; width: number; height: number; mediaSubtypes?: string[] },
  excluded: ExcludedAssetIds,
  opts?: { filename?: string | null }
): boolean {
  return !isScreenshotAsset(asset, excluded.screenshotIds, opts);
}

/* ── Bucket cycle ──────────────────────────────────────────────────────── */

let _bucketCycleIdx = 0;
function nextBucket(): PhotoBucket {
  const b = PHOTO_BUCKET_CYCLE[_bucketCycleIdx];
  _bucketCycleIdx = (_bucketCycleIdx + 1) % PHOTO_BUCKET_CYCLE.length;
  return b;
}

/**
 * Fallback order when the requested bucket is empty. Tries the other two
 * buckets in priority order so the user never sees an empty state.
 */
const BUCKET_FALLBACK_ORDER: Record<PhotoBucket, PhotoBucket[]> = {
  recent: ["older", "throwback"],
  older: ["recent", "throwback"],
  throwback: ["older", "recent"],
};

/* ── Photo queries ─────────────────────────────────────────────────────── */

const REWIND_PHOTO_QUERY: Pick<
  MediaLibrary.AssetsOptions,
  "mediaType" | "sortBy"
> = {
  mediaType: [MediaLibrary.MediaType.photo],
  sortBy: [MediaLibrary.SortBy.creationTime],
};

function bucketTimeFilter(bucket: PhotoBucket): Partial<MediaLibrary.AssetsOptions> {
  const now = Date.now();
  switch (bucket) {
    case "recent":
      return { createdAfter: now - PHOTO_BUCKET_RECENT_MAX_MS };
    case "older":
      return {
        createdAfter: now - PHOTO_BUCKET_OLDER_MAX_MS,
        createdBefore: now - PHOTO_BUCKET_RECENT_MAX_MS,
      };
    case "throwback":
      return { createdBefore: now - PHOTO_BUCKET_OLDER_MAX_MS };
  }
}

async function pickRandomAssetFromBucket(
  bucket: PhotoBucket
): Promise<MediaLibrary.Asset | null> {
  const timeFilter = bucketTimeFilter(bucket);
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

async function pickRandomFromBucketWithFallback(
  desired: PhotoBucket
): Promise<{ asset: MediaLibrary.Asset; bucket: PhotoBucket } | null> {
  const order: PhotoBucket[] = [desired, ...BUCKET_FALLBACK_ORDER[desired]];
  for (const bucket of order) {
    const asset = await pickRandomAssetFromBucket(bucket);
    if (asset) return { asset, bucket };
  }
  return null;
}

/**
 * Picks a uniformly random camera photo from the library, skipping screenshots
 * and images from messaging apps. Internally cycles through recency buckets
 * (3:1:1 recent:older:throwback) but returns the legacy `MediaAsset` shape so
 * existing callers (e.g. the Rewind tab) keep working.
 */
export async function pickRandomPhotoFromLibrary(): Promise<MediaAsset | null> {
  const picked = await pickRandomPhotoWithBucket();
  return picked?.asset ?? null;
}

/**
 * Same as `pickRandomPhotoFromLibrary` but also returns which bucket the
 * photo came from. Use this on capture surfaces that emit `photo_shown`.
 */
export async function pickRandomPhotoWithBucket(): Promise<PickedPhoto | null> {
  const excludedIds = await loadExcludedAssetIds();
  const maxAttempts = 12;

  for (let i = 0; i < maxAttempts; i++) {
    const desired = nextBucket();
    const result = await pickRandomFromBucketWithFallback(desired);
    if (!result) return null;
    if (isCameraPhoto(result.asset, excludedIds)) {
      return {
        asset: mapExpoAsset(result.asset),
        bucket: result.bucket,
        selectionPath: "query_fallback",
      };
    }
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
  throwback: MediaAsset[];
}

let _photoIndex: PhotoIndex | null = null;
let _photoIndexPromise: Promise<PhotoIndex> | null = null;

async function buildPhotoIndex(): Promise<PhotoIndex> {
  if (_photoIndex) return _photoIndex;
  if (_photoIndexPromise) return _photoIndexPromise;

  _photoIndexPromise = (async () => {
    const excludedIds = await loadExcludedAssetIds();
    const now = Date.now();
    const recentEdge = now - PHOTO_BUCKET_RECENT_MAX_MS;
    const olderEdge = now - PHOTO_BUCKET_OLDER_MAX_MS;
    const recent: MediaAsset[] = [];
    const older: MediaAsset[] = [];
    const throwback: MediaAsset[] = [];

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
        if (a.creationTime >= recentEdge) {
          recent.push(mapped);
        } else if (a.creationTime >= olderEdge) {
          older.push(mapped);
        } else {
          throwback.push(mapped);
        }
      }

      hasMore = page.hasNextPage;
      cursor = page.endCursor;
    }

    console.log(
      `[useMediaLibrary] photo index built: ${recent.length} recent, ${older.length} older, ${throwback.length} throwback`
    );
    _photoIndex = { recent, older, throwback };
    _photoIndexPromise = null;
    return _photoIndex;
  })();

  return _photoIndexPromise;
}

function pickFromIndex(
  index: PhotoIndex
): { asset: MediaAsset; bucket: PhotoBucket } | null {
  const desired = nextBucket();
  const order: PhotoBucket[] = [desired, ...BUCKET_FALLBACK_ORDER[desired]];
  for (const bucket of order) {
    const list = index[bucket];
    if (list.length === 0) continue;
    return {
      asset: list[Math.floor(Math.random() * list.length)],
      bucket,
    };
  }
  return null;
}

/* ── URI resolution (ph:// → file://) ──────────────────────────────────── */

const _timeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Resolve `ph://` library URIs to a displayable `file://` path. */
export async function resolveMediaAssetUri(
  asset: MediaAsset
): Promise<MediaAsset> {
  return enqueueMediaLibraryWork(async () => {
    const isVideo = asset.mediaType === "video";

    if (isVideo) {
      try {
        const info = await _timeout(
          MediaLibrary.getAssetInfoAsync(asset.id, {
            shouldDownloadFromNetwork: true,
          }),
          25000
        );
        const source = info?.localUri ?? asset.uri;
        const fileUri = await ensureCachedLibraryVideoFile(
          source,
          asset.id,
          asset.uri
        );
        if (fileUri) return { ...asset, uri: fileUri };
      } catch {
        /* keep thumbnail fallback */
      }
      return asset;
    }

    if (isPlayableMediaUri(asset.uri)) {
      return asset;
    }

    try {
      const manipulated = await _timeout(
        manipulateAsync(asset.uri, [], {
          compress: 0.85,
          format: SaveFormat.JPEG,
        }),
        5000
      );
      if (manipulated?.uri) return { ...asset, uri: manipulated.uri };
    } catch {}

    try {
      const info = await _timeout(
        MediaLibrary.getAssetInfoAsync(asset.id, {
          shouldDownloadFromNetwork: true,
        }),
        8000
      );
      if (info?.localUri) return { ...asset, uri: info.localUri };
    } catch {}

    return asset;
  });
}

export function mediaAssetNeedsUriResolve(asset: MediaAsset): boolean {
  return asset.mediaType === "video" || !isPlayableMediaUri(asset.uri);
}

/**
 * Fast poster path for camera-roll videos — resolves a JPEG thumbnail via
 * `getAssetInfoAsync` + `getThumbnailAsync` without copying the full clip to
 * cache. Use for carousel previews; defer `resolveMediaAssetUri` until play.
 */
export async function resolveVideoPosterForAsset(
  asset: MediaAsset,
  timeSec = 0
): Promise<string | null> {
  const cached = peekVideoPosterUri(asset.id, timeSec);
  if (cached) return cached;

  return enqueueMediaLibraryWork(async () => {
    try {
      const info = await _timeout(
        MediaLibrary.getAssetInfoAsync(asset.id, {
          shouldDownloadFromNetwork: true,
        }),
        15000
      );
      const source = info?.localUri ?? asset.uri;
      if (!source) return null;

      // Raw Photos paths can't be opened by expo-video-thumbnails on device —
      // always copy into the sandbox first, then thumbnail the local copy.
      const fileUri = await ensureCachedLibraryVideoFile(
        source,
        asset.id,
        asset.uri
      );
      if (fileUri) {
        return resolveVideoPosterUri(asset.id, fileUri, timeSec);
      }
    } catch {
      /* fall back to gray + play */
    }
    return null;
  });
}

function prefetchMediaAssetUri(
  asset: MediaAsset,
  resolvedIds: Set<string>,
  onResolved: (asset: MediaAsset) => void,
  opts?: { posterOnly?: boolean }
): void {
  if (resolvedIds.has(asset.id)) return;

  if (asset.mediaType === "video" && opts?.posterOnly) {
    resolvedIds.add(asset.id);
    void resolveVideoPosterForAsset(asset, 0)
      .catch(() => {
        resolvedIds.delete(asset.id);
      });
    return;
  }

  if (!mediaAssetNeedsUriResolve(asset)) return;

  resolvedIds.add(asset.id);
  void resolveMediaAssetUri(asset)
    .then((resolved) => {
      if (isPlayableMediaUri(resolved.uri)) {
        if (resolved.mediaType === "video") {
          prefetchVideoPosterUri(resolved.id, resolved.uri, 0);
        }
        onResolved(resolved);
      } else {
        resolvedIds.delete(asset.id);
      }
    })
    .catch(() => {
      resolvedIds.delete(asset.id);
    });
}

/**
 * Resolve playable URIs for the active carousel slide and its neighbors
 * (±1). Videos get poster-only work unless `prefetchPlayableVideos` is set
 * (e.g. when the user taps play). Center index runs first so the visible
 * card wins the serialized Photos queue on device.
 */
export function prefetchNeighborMediaUris(
  items: MediaAsset[],
  centerIndex: number,
  resolvedIds: Set<string>,
  onResolved: (asset: MediaAsset) => void,
  opts?: { prefetchPlayableVideos?: boolean }
): void {
  const posterOnly = !opts?.prefetchPlayableVideos;
  const indices = [centerIndex, centerIndex - 1, centerIndex + 1].filter(
    (i) => i >= 0 && i < items.length
  );
  const uniqueIndices = [...new Set(indices)];

  uniqueIndices.forEach((i, order) => {
    const asset = items[i];
    if (!asset) return;

    const run = () => {
      if (asset.mediaType === "video" && posterOnly) {
        prefetchMediaAssetUri(asset, resolvedIds, onResolved, { posterOnly: true });
        return;
      }
      if (asset.mediaType !== "video" && mediaAssetNeedsUriResolve(asset)) {
        prefetchMediaAssetUri(asset, resolvedIds, onResolved);
        return;
      }
      if (asset.mediaType === "video" && !posterOnly) {
        prefetchMediaAssetUri(asset, resolvedIds, onResolved);
      }
    };

    if (order === 0) run();
    else setTimeout(run, order * 120);
  });
}

/* ── Pre-buffer (resolve photos ahead of time for instant shuffle) ────── */

const BUFFER_TARGET = 3;
const _preBuffer: PickedPhoto[] = [];
let _isPreBuffering = false;

async function fillPreBuffer(): Promise<void> {
  if (_isPreBuffering || _preBuffer.length >= BUFFER_TARGET) return;
  _isPreBuffering = true;

  try {
    while (_preBuffer.length < BUFFER_TARGET) {
      let next: PickedPhoto | null = null;
      if (_photoIndex) {
        const fromIdx = pickFromIndex(_photoIndex);
        if (fromIdx) {
          const resolved = await resolveMediaAssetUri(fromIdx.asset);
          next = {
            asset: resolved,
            bucket: fromIdx.bucket,
            selectionPath: "index",
          };
        }
      }
      if (!next) {
        const fallback = await pickRandomPhotoWithBucket();
        if (!fallback) break;
        const resolved = await resolveMediaAssetUri(fallback.asset);
        next = {
          ...fallback,
          asset: resolved,
        };
      }
      _preBuffer.push(next);
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

/**
 * Look up a Live Photo's paired video asset on iOS. Returns `null` on Android,
 * for non-Live photos, or when the device hasn't downloaded the paired video.
 * Used at capture time to upload the loopable video alongside the still.
 */
/**
 * Read the EXIF location off a MediaLibrary asset, if present. Returns
 * `null` when geo metadata is missing, when permission is denied, or when
 * the underlying call throws. Coordinates are exactly as the OS reports
 * them — reverse-geocoding to a human label is done elsewhere
 * (`lib/reverseGeocode.ts`).
 */
export async function getAssetGeoLocation(
  assetId: string
): Promise<{ latitude: number; longitude: number } | null> {
  return enqueueMediaLibraryWork(async () => {
    try {
      const info = (await MediaLibrary.getAssetInfoAsync(assetId)) as
        | (MediaLibrary.AssetInfo & {
            location?: { latitude?: number; longitude?: number } | null;
          })
        | null;
      const loc = info?.location;
      if (!loc) return null;
      const lat = loc.latitude;
      const lng = loc.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { latitude: lat, longitude: lng };
    } catch {
      return null;
    }
  });
}

const livePhotoVideoUriCache = new Map<
  string,
  Promise<{ uri: string; durationMs: number | null } | null>
>();

/** Serialize Photos `getAssetInfoAsync` / `requestAVAsset` work — concurrent calls crash iOS. */
let mediaLibraryWorkTail: Promise<unknown> = Promise.resolve();

export function enqueueMediaLibraryWork<T>(fn: () => Promise<T>): Promise<T> {
  const next = mediaLibraryWorkTail.then(fn, fn);
  mediaLibraryWorkTail = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function fetchLivePhotoVideoUri(
  assetId: string
): Promise<{ uri: string; durationMs: number | null } | null> {
  return enqueueMediaLibraryWork(async () => {
    try {
      const info = (await MediaLibrary.getAssetInfoAsync(
        assetId
      )) as MediaLibrary.AssetInfo & {
        mediaSubtypes?: string[];
        pairedVideoAsset?: { uri?: string; localUri?: string; duration?: number };
      };
      const isLive =
        info?.mediaSubtypes?.includes("livePhoto") ||
        info?.mediaSubtypes?.includes("photoLive");
      if (!isLive) return null;
      const paired = info.pairedVideoAsset;
      if (!paired) return null;
      // `pairedVideoAsset` is a bare `Asset` — it carries a `ph://` uri but no
      // `localUri`. Resolve the paired asset's own info to get a real file
      // path; that copies far more reliably into the sandbox than the raw
      // `ph://` paired uri. Fall back to the `ph://` uri if that lookup fails.
      let localUri = paired.localUri ?? null;
      if (!localUri && paired.id) {
        try {
          const pairedInfo = await MediaLibrary.getAssetInfoAsync(paired.id);
          localUri = pairedInfo?.localUri ?? null;
        } catch {
          /* fall back to the paired ph:// uri below */
        }
      }
      const fallbackUri = paired.uri ?? null;
      const raw = localUri ?? fallbackUri;
      if (!raw) return null;
      const fileUri = await ensureCachedLibraryVideoFile(
        raw,
        `${assetId}-live`,
        localUri ? fallbackUri ?? undefined : undefined
      );
      if (!fileUri) return null;
      const durationMs =
        typeof paired.duration === "number" ? paired.duration * 1000 : null;
      return { uri: fileUri, durationMs };
    } catch {
      return null;
    }
  });
}

/** Paired Live Photo video URI (iOS). Dedupes concurrent lookups per asset id. */
export async function getLivePhotoVideoUri(
  assetId: string
): Promise<{ uri: string; durationMs: number | null } | null> {
  if (Platform.OS !== "ios") return null;
  let pending = livePhotoVideoUriCache.get(assetId);
  if (!pending) {
    pending = fetchLivePhotoVideoUri(assetId);
    livePhotoVideoUriCache.set(assetId, pending);
  }
  return pending;
}

/**
 * Same-day-different-year photos for a contiguous prior-year window.
 * `fromYearsBack` / `toYearsBack` are inclusive (1 = one year ago).
 */
export async function queryCameraPhotosForPriorYearsWindow(
  month: number,
  day: number,
  opts: {
    fromYearsBack: number;
    toYearsBack: number;
    nowYear?: number;
    lightweight?: boolean;
  }
): Promise<MediaAsset[]> {
  const nowYear = opts.nowYear ?? new Date().getFullYear();
  const lightweight = opts.lightweight ?? true;
  const from = Math.max(1, opts.fromYearsBack);
  const to = Math.max(from, opts.toYearsBack);

  const dates: Date[] = [];
  for (let i = from; i <= to; i++) {
    const year = nowYear - i;
    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      continue;
    }
    dates.push(d);
  }

  const lists = await Promise.all(
    dates.map((d) => queryCameraPhotosForLocalDay(d, { lightweight }))
  );
  const out = lists.flat();
  out.sort((a, b) => b.creationTime - a.creationTime);
  return out;
}

/**
 * Lightweight index of every camera photo/video on this month/day in prior
 * years (newest first). Metadata only — no URI resolution or thumbnails.
 */
export async function querySameDateInPastCatalog(
  month: number,
  day: number,
  opts?: {
    maxYearsBack?: number;
    nowYear?: number;
    lightweight?: boolean;
  }
): Promise<MediaAsset[]> {
  const maxYearsBack = opts?.maxYearsBack ?? 10;
  return queryCameraPhotosForPriorYearsWindow(month, day, {
    fromYearsBack: 1,
    toYearsBack: maxYearsBack,
    nowYear: opts?.nowYear,
    lightweight: opts?.lightweight ?? true,
  });
}

/**
 * Same-day-different-year photos. For "Today In Your Past" on the Capture
 * feed: for each prior year (up to `maxYearsBack`), runs the day query and
 * concatenates results, sorted newest first.
 */
export async function queryCameraPhotosForSameDateInPriorYears(
  month: number,
  day: number,
  opts: {
    maxYearsBack?: number;
    nowYear?: number;
    maxResults?: number;
    /** Skip per-asset `getAssetInfoAsync` — much faster for carousels. */
    lightweight?: boolean;
  } = {}
): Promise<MediaAsset[]> {
  const maxResults = opts.maxResults ?? 50;
  const out = await querySameDateInPastCatalog(month, day, opts);
  return out.slice(0, maxResults);
}

/**
 * Recent camera-roll photos/videos for onboarding montage backgrounds.
 * Sorted newest-first, capped at `limit`.
 */
export async function queryRecentCameraPhotos(opts?: {
  daysBack?: number;
  limit?: number | null;
  lightweight?: boolean;
}): Promise<MediaAsset[]> {
  const daysBack = opts?.daysBack ?? 30;
  const limit = opts?.limit ?? 20;
  const lightweight = opts?.lightweight ?? true;
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);

  const excludedIds = await loadExcludedAssetIds();
  const out: MediaAsset[] = [];
  let after: string | undefined;
  let guard = 0;
  const hasLimit = limit != null;
  while (guard++ < 40 && (!hasLimit || out.length < limit!)) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      createdAfter: start.getTime(),
      first: 200,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (lightweight) {
        if (isDayCapturePhoto(a, excludedIds)) {
          out.push(mapExpoAsset(a));
        }
      } else {
        let merged: MediaLibrary.Asset = a;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.id);
          merged = { ...a, ...info };
        } catch {
          /* use list row */
        }
        const filename =
          ("filename" in merged && typeof merged.filename === "string"
            ? merged.filename
            : null) ?? null;
        if (isDayCapturePhoto(merged, excludedIds, { filename })) {
          out.push(mapExpoAsset(merged));
        }
      }
      if (out.length >= limit!) break;
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  out.sort((a, b) => b.creationTime - a.creationTime);
  return hasLimit ? out.slice(0, limit!) : out;
}

/**
 * Photos/videos for the onboarding montage: the user's Favorites first, topped
 * up from the recent camera roll when there aren't many of them.
 *
 * Favorites are the ones worth looking at, and they're what the first-capture
 * chat goes on to offer — so the montage that precedes it should be drawn from
 * the same well. No date window here, unlike the recent query: a favorite from
 * two years ago is still a favorite, and restricting to the last month would
 * empty the album for most people.
 *
 * The top-up matters because the montage cycles one asset at a time; a couple
 * of favorites on their own would visibly loop.
 */
export async function queryOnboardingMontagePhotos(opts?: {
  daysBack?: number;
  limit?: number;
}): Promise<MediaAsset[]> {
  const limit = opts?.limit ?? 20;
  const favorites = await queryFavoritePhotos({ limit });
  if (favorites.length >= MONTAGE_MIN_ASSETS) return favorites;

  const recent = await queryRecentCameraPhotos({
    daysBack: opts?.daysBack ?? 30,
    limit,
  });
  if (favorites.length === 0) return recent;

  const seen = new Set(favorites.map((a) => a.id));
  const merged = [...favorites];
  for (const asset of recent) {
    if (merged.length >= limit) break;
    if (seen.has(asset.id)) continue;
    seen.add(asset.id);
    merged.push(asset);
  }
  return merged;
}

/** Below this many favorites the montage gets padded from the camera roll. */
const MONTAGE_MIN_ASSETS = 6;

/**
 * Newest assets from the Favorites album, filtered the same way the rest of the
 * app filters camera media. Empty when there's no such album or nothing in it.
 */
export async function queryFavoritePhotos(opts?: {
  limit?: number;
}): Promise<MediaAsset[]> {
  const limit = opts?.limit ?? 20;
  const album = await findFavoritesAlbum();
  if (!album) return [];

  const excludedIds = await loadExcludedAssetIds();
  const out: MediaAsset[] = [];
  let after: string | undefined;
  let guard = 0;
  while (guard++ < 20 && out.length < limit) {
    const page = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: 200,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (isDayCapturePhoto(a, excludedIds)) out.push(mapExpoAsset(a));
      if (out.length >= limit) break;
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  out.sort((a, b) => b.creationTime - a.creationTime);
  return out.slice(0, limit);
}

export interface RecentMediaPage {
  assets: MediaAsset[];
  /** Opaque cursor to pass back as `after` to fetch the next page. */
  endCursor: string | null;
  hasNextPage: boolean;
}

/**
 * Cursor-paginated stream of recent camera media (photos + videos), newest
 * first, filtered by the standard day-capture filter. Powers the continuous
 * "recent moments" carousel on Capture — start with no cursor for the most
 * recent page, then pass `endCursor` back as `after` to lazily extend as the
 * user swipes toward the end. `lightweight` skips per-asset `getAssetInfoAsync`
 * for speed (URIs are resolved lazily elsewhere).
 */
export async function queryRecentCameraMediaPage(opts?: {
  after?: string | null;
  /** Target number of filtered assets to collect per call. */
  pageSize?: number;
  lightweight?: boolean;
}): Promise<RecentMediaPage> {
  const pageSize = opts?.pageSize ?? 24;
  const lightweight = opts?.lightweight ?? true;
  const excludedIds = await loadExcludedAssetIds();
  const out: MediaAsset[] = [];
  let after: string | undefined = opts?.after ?? undefined;
  let endCursor: string | null = opts?.after ?? null;
  let hasNextPage = true;
  let guard = 0;
  while (guard++ < 40 && out.length < pageSize) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: 100,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (lightweight) {
        if (isDayCapturePhoto(a, excludedIds)) out.push(mapExpoAsset(a));
      } else {
        let merged: MediaLibrary.Asset = a;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.id);
          merged = { ...a, ...info };
        } catch {
          /* use list row */
        }
        const filename =
          ("filename" in merged && typeof merged.filename === "string"
            ? merged.filename
            : null) ?? null;
        if (isDayCapturePhoto(merged, excludedIds, { filename })) {
          out.push(mapExpoAsset(merged));
        }
      }
    }
    endCursor = page.endCursor ?? endCursor;
    after = page.endCursor ?? undefined;
    if (!page.hasNextPage || !page.endCursor) {
      hasNextPage = false;
      break;
    }
  }
  return { assets: out, endCursor, hasNextPage };
}

/** Photos/videos taken during a calendar month (yyyy-MM), newest first. */
export async function queryCameraPhotosForMonth(
  monthKey: string,
  opts?: { limit?: number | null; lightweight?: boolean }
): Promise<MediaAsset[]> {
  return queryAllCameraPhotosForMonth(monthKey, {
    lightweight: opts?.lightweight,
    limit: opts?.limit ?? null,
  });
}

/**
 * Every selectable photo/video in a calendar month — paginated, no day cap.
 *
 * Pass `limit` when the caller only needs a handful (e.g. montage
 * backgrounds); paging stops as soon as the limit is met rather than walking
 * the whole month, which on a heavy month is thousands of assets.
 */
export async function queryAllCameraPhotosForMonth(
  monthKey: string,
  opts?: { lightweight?: boolean; limit?: number | null }
): Promise<MediaAsset[]> {
  const [y, m] = monthKey.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 0, 23, 59, 59, 999);
  const lightweight = opts?.lightweight ?? true;
  const limit = opts?.limit ?? null;
  const excludedIds = await loadExcludedAssetIds();
  const out: MediaAsset[] = [];
  let after: string | undefined;
  let guard = 0;
  while (guard++ < 200 && (limit == null || out.length < limit)) {
    const page = await MediaLibrary.getAssetsAsync({
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      createdAfter: start.getTime(),
      createdBefore: end.getTime(),
      first: 500,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (lightweight) {
        if (isDayCapturePhoto(a, excludedIds)) {
          out.push(mapExpoAsset(a));
        }
      } else {
        let merged: MediaLibrary.Asset = a;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a.id);
          merged = { ...a, ...info };
        } catch {
          /* use list row */
        }
        const filename =
          ("filename" in merged && typeof merged.filename === "string"
            ? merged.filename
            : null) ?? null;
        if (isDayCapturePhoto(merged, excludedIds, { filename })) {
          out.push(mapExpoAsset(merged));
        }
      }
      if (limit != null && out.length >= limit) break;
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  out.sort((a, b) => b.creationTime - a.creationTime);
  return limit == null ? out : out.slice(0, limit);
}

/**
 * Fetch all selectable photos for a local calendar day (paginated). Filters
 * out screenshots only — photos received that day via text / WhatsApp /
 * other messengers are intentionally included so the user can capture a
 * moment around them. Does not touch hook state — safe for Capture /
 * onboarding day-carousel.
 */
export async function queryCameraPhotosForLocalDay(
  date: Date,
  opts?: { lightweight?: boolean }
): Promise<MediaAsset[]> {
  const lightweight = opts?.lightweight ?? false;
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const excludedIds = await loadExcludedAssetIds();
  const out: MediaAsset[] = [];
  let after: string | undefined;
  let guard = 0;
  while (guard++ < 30) {
    const page = await MediaLibrary.getAssetsAsync({
      // Include videos alongside photos so the day carousel can offer
      // short clips for capture too — `mapExpoAsset` reads the asset's
      // actual `mediaType` so videos surface as `{ mediaType: "video" }`.
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      createdAfter: start.getTime(),
      createdBefore: end.getTime(),
      first: 200,
      sortBy: [MediaLibrary.SortBy.creationTime],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (lightweight) {
        if (isDayCapturePhoto(a, excludedIds)) {
          out.push(mapExpoAsset(a));
        }
        continue;
      }
      let merged: MediaLibrary.Asset = a;
      try {
        const info = await MediaLibrary.getAssetInfoAsync(a.id);
        merged = { ...a, ...info };
      } catch {
        /* use list row only */
      }
      const filename =
        ("filename" in merged && typeof merged.filename === "string"
          ? merged.filename
          : null) ?? null;
      if (isDayCapturePhoto(merged, excludedIds, { filename })) {
        out.push(mapExpoAsset(merged));
      }
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  return out;
}

interface MagicFillPhotoMeta {
  asset: MediaAsset;
  isCamera: boolean;
  isLivePhoto: boolean;
  score: number;
}

/**
 * Rank day photos for Magic Fill — prefer camera captures over messaging
 * imports, Live Photos, higher resolution, and mid-day timestamps.
 */
export async function rankPhotosForMagicFill(
  photos: MediaAsset[]
): Promise<MediaAsset[]> {
  if (photos.length <= 1) return photos;

  const excludedIds = await loadExcludedAssetIds();
  const metas: MagicFillPhotoMeta[] = [];

  for (const asset of photos) {
    let isCamera = true;
    let isLivePhoto = false;
    let filename: string | null = null;
    try {
      const info = (await MediaLibrary.getAssetInfoAsync(asset.id)) as
        MediaLibrary.AssetInfo & { mediaSubtypes?: string[]; filename?: string };
      filename =
        typeof info.filename === "string" ? info.filename : null;
      isCamera = isCameraPhoto(
        { ...asset, mediaSubtypes: info.mediaSubtypes },
        excludedIds,
        { filename }
      );
      isLivePhoto = Boolean(
        info.mediaSubtypes?.includes("livePhoto") ||
          info.mediaSubtypes?.includes("photoLive")
      );
    } catch {
      isCamera = isCameraPhoto(asset, excludedIds);
    }

    const pixels = asset.width * asset.height;
    const hour = new Date(asset.creationTime).getHours();
    const midDayBonus = hour >= 8 && hour <= 20 ? 1 : 0;

    let score = 0;
    if (isCamera) score += 1000;
    if (isLivePhoto) score += 500;
    score += Math.min(pixels / 10000, 200);
    score += midDayBonus * 50;

    metas.push({ asset, isCamera, isLivePhoto, score });
  }

  metas.sort((a, b) => b.score - a.score);
  return metas.map((m) => m.asset);
}

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

  const getRandomAsset = useCallback(async (): Promise<PickedPhoto | null> => {
    // Instant: serve from pre-buffer
    if (_preBuffer.length > 0) {
      const picked = _preBuffer.shift()!;
      console.log(
        `[useMediaLibrary] served from buffer (bucket=${picked.bucket}):`,
        picked.asset.id
      );
      void fillPreBuffer();
      return picked;
    }

    // Fast: pick from in-memory index, then resolve URI
    if (_photoIndex) {
      const fromIdx = pickFromIndex(_photoIndex);
      if (fromIdx) {
        console.log(
          `[useMediaLibrary] picked from index (bucket=${fromIdx.bucket}):`,
          fromIdx.asset.id
        );
        const resolved = await resolveToFileUri(fromIdx.asset);
        void fillPreBuffer();
        return {
          asset: resolved,
          bucket: fromIdx.bucket,
          selectionPath: "index",
        };
      }
    }

    // Fallback: original query-based approach (cycles through buckets too)
    const picked = await _timeout(pickRandomPhotoWithBucket(), 8000);
    if (!picked) {
      console.log("[useMediaLibrary] pickRandomPhoto returned null");
      return null;
    }
    console.log(
      `[useMediaLibrary] picked via query fallback (bucket=${picked.bucket}):`,
      picked.asset.id
    );
    const resolved = await resolveMediaAssetUri(picked.asset);
    void fillPreBuffer();
    return {
      ...picked,
      asset: resolved,
    };
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
