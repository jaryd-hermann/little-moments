import { getAssetGeoLocation, getLivePhotoVideoUri } from "@/hooks/useMediaLibrary";
import { captureEvent, captureException } from "@/lib/errors";
import {
  enqueuePendingMedia,
  getPendingMedia,
  markPendingMediaAttempted,
  removePendingMedia,
  MAX_MEDIA_AGE_MS,
  MAX_MEDIA_ATTEMPTS,
  type PendingMediaItem,
} from "@/lib/pendingMediaQueue";
import { reverseGeocode } from "@/lib/reverseGeocode";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { EntryMedia } from "@/store/entryStore";

export interface AttachEntryMediaInput {
  userId: string;
  entryId: string;
  /** Local file/asset URI to upload. */
  uri: string;
  mediaType?: "image" | "video";
  /** Photos library asset id. Enables Live Photo and EXIF location enrichment. */
  assetId?: string | null;
  takenAtIso?: string | null;
  displayOrder?: number;
  /** Object already in storage — set when resuming a queued attempt. */
  uploaded?: { storagePath: string; storageUrl: string } | null;
  /** Persist for a later retry if this attempt fails. Default true. */
  queueOnFailure?: boolean;
  /** Fired once Live Photo / location enrichment has landed on the row. */
  onEnriched?: () => void;
}

/**
 * Upload a photo and link it to its moment.
 *
 * Ordering matters more than it looks: the `entry_media` row is written the
 * instant the upload lands, and Live Photo + location enrichment happen
 * afterwards as an update. Enrichment costs a second upload and a network
 * geocode, and doing it before the insert left a multi-second window where
 * backgrounding the app stranded a photo in storage with no row pointing at
 * it — moments showed the "·" placeholder in Capsule and no media at all on
 * the detail screen.
 *
 * Failures are queued rather than logged and dropped. Returns the row, or
 * null if the photo could not be attached this time.
 */
export async function attachEntryMedia(
  input: AttachEntryMediaInput
): Promise<EntryMedia | null> {
  const {
    userId,
    entryId,
    uri,
    mediaType = "image",
    assetId = null,
    takenAtIso = null,
    displayOrder = 0,
    uploaded = null,
    queueOnFailure = true,
    onEnriched,
  } = input;

  let storagePath = uploaded?.storagePath ?? null;
  let storageUrl = uploaded?.storageUrl ?? null;

  try {
    if (!storagePath || !storageUrl) {
      const result = await uploadEntryMedia(userId, entryId, uri, mediaType);
      storagePath = result.storagePath;
      storageUrl = result.publicUrl;
    }

    const { data: row, error } = await supabase
      .from("entry_media")
      .insert({
        entry_id: entryId,
        user_id: userId,
        storage_path: storagePath,
        storage_url: storageUrl,
        media_type: mediaType,
        display_order: displayOrder,
        taken_at: takenAtIso,
      })
      .select()
      .single();

    if (error) throw error;

    // The photo is safe from here on; enrichment is best-effort decoration.
    if (row && assetId && mediaType === "image") {
      void enrichEntryMedia(userId, entryId, row.id, assetId).then((changed) => {
        if (changed) onEnriched?.();
      });
    }

    return (row as EntryMedia) ?? null;
  } catch (err) {
    captureException(err, {
      context: "attachEntryMedia",
      entry_id: entryId,
      // Distinguishes "never reached storage" from "uploaded but unlinked".
      uploaded: Boolean(storagePath),
    });
    if (queueOnFailure) {
      await enqueuePendingMedia({
        userId,
        entryId,
        uri,
        mediaType,
        assetId,
        takenAtIso,
        displayOrder,
        storagePath,
        storageUrl,
      });
    }
    return null;
  }
}

/**
 * Add the Live Photo companion video and a human-readable location to a row
 * that is already attached. Returns whether anything was written.
 */
async function enrichEntryMedia(
  userId: string,
  entryId: string,
  mediaId: string,
  assetId: string
): Promise<boolean> {
  const patch: Record<string, unknown> = {};

  try {
    const paired = await getLivePhotoVideoUri(assetId);
    if (paired?.uri) {
      const upload = await uploadEntryMedia(userId, entryId, paired.uri, "video");
      patch.paired_video_storage_path = upload.storagePath;
      patch.paired_video_storage_url = upload.publicUrl;
      captureEvent("live_photo_uploaded", {
        entry_id: entryId,
        duration_ms: paired.durationMs,
      });
    }
  } catch (err) {
    if (__DEV__) console.warn("[attachEntryMedia] Live Photo upload failed:", err);
  }

  try {
    const geo = await getAssetGeoLocation(assetId);
    if (geo) {
      patch.location_latitude = geo.latitude;
      patch.location_longitude = geo.longitude;
      patch.location_name = await reverseGeocode(geo.latitude, geo.longitude);
    }
  } catch (err) {
    if (__DEV__) console.warn("[attachEntryMedia] Location lookup failed:", err);
  }

  if (Object.keys(patch).length === 0) return false;

  const { error } = await supabase
    .from("entry_media")
    .update(patch)
    .eq("id", mediaId);
  return !error;
}

/** Foreground transitions can fire in quick succession; never drain twice at once. */
let draining = false;

/**
 * Retry every queued photo. Safe to call repeatedly — items are dropped once
 * they succeed, become unrecoverable, or run out of attempts.
 *
 * Returns how many photos were rescued so callers can refresh the feed.
 */
export async function drainPendingEntryMedia(userId: string): Promise<number> {
  if (draining) return 0;
  const queue = await getPendingMedia();
  if (queue.length === 0) return 0;

  draining = true;
  try {
    return await drainQueue(queue, userId);
  } finally {
    draining = false;
  }
}

async function drainQueue(
  queue: PendingMediaItem[],
  userId: string
): Promise<number> {
  let recovered = 0;

  for (const item of queue) {
    if (item.userId !== userId) continue;

    const expired =
      item.attempts >= MAX_MEDIA_ATTEMPTS ||
      Date.now() - new Date(item.queuedAt).getTime() > MAX_MEDIA_AGE_MS;
    if (expired) {
      await removePendingMedia(item.id);
      continue;
    }

    const resolution = await resolvePendingItem(item);
    if (resolution === "gone" || resolution === "already-attached") {
      await removePendingMedia(item.id);
      continue;
    }

    await markPendingMediaAttempted(item.id);
    const row = await attachEntryMedia({
      userId: item.userId,
      entryId: item.entryId,
      uri: item.uri,
      mediaType: item.mediaType,
      assetId: item.assetId,
      takenAtIso: item.takenAtIso,
      displayOrder: item.displayOrder,
      uploaded:
        item.storagePath && item.storageUrl
          ? { storagePath: item.storagePath, storageUrl: item.storageUrl }
          : null,
      // Re-queueing on failure is what carries a fresh storage_path back into
      // the item, so a retry that uploads but fails to insert doesn't upload
      // a second copy next time. enqueuePendingMedia matches on entry + URI,
      // so this updates the existing record rather than adding another.
    });

    if (row) {
      await removePendingMedia(item.id);
      recovered += 1;
    }
  }

  return recovered;
}

type PendingResolution = "retry" | "gone" | "already-attached";

/** Drop work for deleted moments and for photos a later save already linked. */
async function resolvePendingItem(
  item: PendingMediaItem
): Promise<PendingResolution> {
  const { data: entry } = await supabase
    .from("entries")
    .select("id")
    .eq("id", item.entryId)
    .maybeSingle();
  if (!entry) return "gone";

  if (item.storagePath) {
    const { data: existing } = await supabase
      .from("entry_media")
      .select("id")
      .eq("entry_id", item.entryId)
      .eq("storage_path", item.storagePath)
      .maybeSingle();
    if (existing) return "already-attached";
  }

  return "retry";
}
