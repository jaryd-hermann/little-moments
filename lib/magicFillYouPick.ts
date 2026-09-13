import type { MediaAsset } from "@/hooks/useMediaLibrary";
import { findFavoritesAlbum } from "@/lib/favoritesAlbum";
import { rankPhotosForMagicFillLightweight } from "@/lib/magicFill";
import type { MagicFillDraft, PickedVideoClip } from "@/store/magicFillStore";
import { selectedPhoto } from "@/store/magicFillStore";
import { format } from "date-fns";
import type { ImagePickerAsset, ImagePickerResult } from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

export const MAGIC_FILL_YOU_PICK_MAX = 15;

function ymdFromCreationTime(creationTime: number): string {
  return format(new Date(creationTime), "yyyy-MM-dd");
}

/** Reject a hung promise so a single stuck asset can't freeze the whole flow. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout")),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function pickerAssetToMediaAsset(
  asset: ImagePickerAsset
): Promise<MediaAsset | null> {
  const isVideo = asset.type === "video";
  const mediaType: "photo" | "video" = isVideo ? "video" : "photo";

  if (asset.assetId) {
    try {
      // `shouldDownloadFromNetwork: false` — we only need lightweight metadata
      // (creationTime) here, not the full-res original. Requesting the network
      // download was making "You pick" hang indefinitely on iCloud photos and
      // videos that hadn't synced locally. `expo-image-picker` already hands us
      // a usable local `uri`, so we fall back to that.
      const info = await withTimeout(
        MediaLibrary.getAssetInfoAsync(asset.assetId, {
          shouldDownloadFromNetwork: false,
        }),
        4000
      );
      const creationTime =
        typeof info.creationTime === "number" && info.creationTime > 0
          ? info.creationTime
          : Date.now();
      return {
        id: asset.assetId,
        uri: info.localUri ?? asset.uri,
        creationTime,
        mediaType,
        width: asset.width || info.width || 0,
        height: asset.height || info.height || 0,
      };
    } catch {
      /* fall through — use the picker-provided asset directly */
    }
  }

  if (!asset.uri) return null;
  return {
    id: asset.assetId ?? asset.uri,
    uri: asset.uri,
    creationTime: Date.now(),
    mediaType,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

/**
 * Group media assets into one draft per calendar day (best photo selected,
 * the rest kept as swappable alternates). Shared by "You pick" and the
 * "favorites" fast-path.
 */
export function buildDraftsFromMediaAssets(
  mediaAssets: MediaAsset[]
): MagicFillDraft[] {
  const byDay = new Map<string, MediaAsset[]>();
  for (const photo of mediaAssets) {
    const ymd = ymdFromCreationTime(photo.creationTime);
    const bucket = byDay.get(ymd);
    if (bucket) {
      bucket.push(photo);
    } else {
      byDay.set(ymd, [photo]);
    }
  }

  const drafts: MagicFillDraft[] = [];
  for (const [ymd, photos] of byDay) {
    const ranked = rankPhotosForMagicFillLightweight(photos);
    drafts.push({
      ymd,
      date: new Date(`${ymd}T12:00:00`),
      photos: ranked,
      selectedIndex: 0,
      skipped: false,
      rawCaption: "",
    });
  }

  drafts.sort((a, b) => b.date.getTime() - a.date.getTime());
  return drafts;
}

export async function buildDraftsFromPickerAssets(
  assets: ImagePickerAsset[]
): Promise<MagicFillDraft[]> {
  // Resolve in parallel — a serial loop meant one slow (iCloud) asset held up
  // every asset behind it, making the picker feel frozen.
  const mapped = await Promise.all(
    assets
      .slice(0, MAGIC_FILL_YOU_PICK_MAX)
      .map((asset) =>
        pickerAssetToMediaAsset(asset).catch(() => null)
      )
  );
  const mediaAssets = mapped.filter((a): a is MediaAsset => a != null);

  return buildDraftsFromMediaAssets(mediaAssets);
}

export function collectVideosFromDrafts(
  drafts: MagicFillDraft[]
): MediaAsset[] {
  const seen = new Set<string>();
  const out: MediaAsset[] = [];
  for (const draft of drafts) {
    for (const photo of draft.photos) {
      if (photo.mediaType !== "video" || seen.has(photo.id)) continue;
      seen.add(photo.id);
      out.push(photo);
    }
  }
  return out;
}

/** Selected (non-skipped) video per draft that still needs trimming. */
export function collectSelectedVideosFromDrafts(
  drafts: MagicFillDraft[],
  pickedVideoClips: Record<string, PickedVideoClip> = {}
): MediaAsset[] {
  const seen = new Set<string>();
  const out: MediaAsset[] = [];
  for (const draft of drafts) {
    if (draft.skipped) continue;
    const photo = selectedPhoto(draft);
    if (!photo || photo.mediaType !== "video" || seen.has(photo.id)) continue;
    if (pickedVideoClips[photo.id]?.resolvedUri) continue;
    seen.add(photo.id);
    out.push(photo);
  }
  return out;
}

export const MAGIC_FILL_FAVORITES_MAX = 5;

/**
 * Set of `taken_at` timestamps (ms) for every photo/video already attached to
 * a moment. Used to skip favorites the user has already captured. Matching is
 * exact-ms because `taken_at` is persisted as `new Date(creationTime).toISOString()`.
 */
export function buildCapturedTakenAtMsSet(
  entries: { media?: { taken_at?: string | null }[] | null }[]
): Set<number> {
  const set = new Set<number>();
  for (const entry of entries) {
    for (const media of entry.media ?? []) {
      if (!media.taken_at) continue;
      const ms = new Date(media.taken_at).getTime();
      if (Number.isFinite(ms)) set.add(ms);
    }
  }
  return set;
}

/**
 * Uncaptured favorites across up to `dayLimit` unique calendar days (newest
 * days first). Keeps paging the Favorites album until that many distinct days
 * are found or the album is exhausted. Additional favorites on those days are
 * kept as swipeable alternates; favorites on other days are ignored once the
 * day cap is reached.
 */
export async function queryRecentUncapturedFavorites(opts: {
  capturedTakenAtMs: Set<number>;
  dayLimit?: number;
}): Promise<MediaAsset[]> {
  const dayLimit = opts.dayLimit ?? MAGIC_FILL_FAVORITES_MAX;
  const album = await findFavoritesAlbum();
  if (!album) return [];

  const byDay = new Map<string, MediaAsset[]>();

  let after: string | undefined;
  let guard = 0;
  while (guard++ < 40) {
    const page = await MediaLibrary.getAssetsAsync({
      album,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      first: 100,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      ...(after ? { after } : {}),
    });
    for (const a of page.assets) {
      if (opts.capturedTakenAtMs.has(a.creationTime)) continue;
      const ymd = ymdFromCreationTime(a.creationTime);
      const asset: MediaAsset = {
        id: a.id,
        uri: a.uri,
        creationTime: a.creationTime,
        mediaType:
          (a as unknown as { mediaType?: string }).mediaType === "video"
            ? "video"
            : "photo",
        width: a.width,
        height: a.height,
      };

      const bucket = byDay.get(ymd);
      if (bucket) {
        bucket.push(asset);
      } else if (byDay.size < dayLimit) {
        byDay.set(ymd, [asset]);
      }
    }
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }

  const out: MediaAsset[] = [];
  const sortedDays = [...byDay.entries()].sort(
    (a, b) =>
      new Date(`${b[0]}T12:00:00`).getTime() -
      new Date(`${a[0]}T12:00:00`).getTime()
  );
  for (const [, photos] of sortedDays) {
    out.push(...photos);
  }
  return out;
}

export async function launchMagicFillPhotoPicker(): Promise<
  ImagePickerAsset[] | null
> {
  const ImagePicker = await import("expo-image-picker");

  let result: ImagePickerResult | null = null;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: MAGIC_FILL_YOU_PICK_MAX,
      quality: 1,
    });
  } catch {
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: false,
        quality: 1,
      });
    } catch {
      return null;
    }
  }

  if (!result || result.canceled || result.assets.length === 0) {
    return null;
  }

  return result.assets.slice(0, MAGIC_FILL_YOU_PICK_MAX);
}
