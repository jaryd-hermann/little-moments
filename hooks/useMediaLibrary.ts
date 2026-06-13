import { useState, useCallback, useRef } from "react";
import { Dimensions, PixelRatio, Platform } from "react-native";
import * as MediaLibrary from "expo-media-library";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  PHOTO_BUCKET_CYCLE,
  PHOTO_BUCKET_RECENT_MAX_MS,
  PHOTO_BUCKET_OLDER_MAX_MS,
  type PhotoBucket,
} from "@/lib/photoBucket";

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

    if (!isVideo) {
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
    }

    try {
      const timeoutMs = isVideo ? 25000 : 8000;
      const info = await _timeout(
        MediaLibrary.getAssetInfoAsync(asset.id, {
          shouldDownloadFromNetwork: true,
        }),
        timeoutMs
      );
      if (info?.localUri) return { ...asset, uri: info.localUri };
    } catch {}

    return asset;
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
      const uri = paired.localUri ?? paired.uri ?? null;
      if (!uri) return null;
      const durationMs =
        typeof paired.duration === "number" ? paired.duration * 1000 : null;
      return { uri, durationMs };
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
  const maxYearsBack = opts.maxYearsBack ?? 10;
  const nowYear = opts.nowYear ?? new Date().getFullYear();
  const maxResults = opts.maxResults ?? 50;
  const lightweight = opts.lightweight ?? true;

  const dates: Date[] = [];
  for (let i = 1; i <= maxYearsBack; i++) {
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
  return out.slice(0, maxResults);
}

/**
 * Recent camera-roll photos/videos for onboarding montage backgrounds.
 * Sorted newest-first, capped at `limit`.
 */
export async function queryRecentCameraPhotos(opts?: {
  daysBack?: number;
  limit?: number;
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
  while (guard++ < 40 && out.length < limit) {
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
      if (out.length >= limit) break;
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  out.sort((a, b) => b.creationTime - a.creationTime);
  return out.slice(0, limit);
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
