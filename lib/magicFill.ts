import { format, subDays } from "date-fns";
import {
  queryCameraPhotosForLocalDay,
  rankPhotosForMagicFill,
  getLivePhotoVideoUri,
  getAssetGeoLocation,
} from "@/hooks/useMediaLibrary";
import { callMomentAssemble } from "@/lib/momentAssist";
import { categorizePhotoBucket, photoAgeDays } from "@/lib/photoBucket";
import { reverseGeocode } from "@/lib/reverseGeocode";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { MagicFillGapTarget, MagicFillDraft } from "@/store/magicFillStore";
import { MAGIC_FILL_MAX_SCAN_DAYS } from "@/lib/magicFillGapCache";

export { isGapCountCacheValid } from "@/lib/magicFillGapCache";

export function buildMomentDateSet(
  entries: { entry_type?: string | null; entry_date?: string | null }[]
): Set<string> {
  return new Set(
    entries
      .filter((e) => e.entry_type === "moment" && e.entry_date)
      .map((e) => e.entry_date as string)
  );
}

/**
 * Count how many of the most recent gap days (photos, no moment) exist,
 * up to `gapTarget`.
 */
export async function countAvailableGapDays(
  gapTarget: MagicFillGapTarget,
  existingMomentDates: Set<string>
): Promise<number> {
  let count = 0;
  for (
    let i = 1;
    i <= MAGIC_FILL_MAX_SCAN_DAYS && count < gapTarget;
    i++
  ) {
    const d = subDays(new Date(), i);
    const ymd = format(d, "yyyy-MM-dd");
    if (existingMomentDates.has(ymd)) continue;
    const photos = await queryCameraPhotosForLocalDay(d, { lightweight: true });
    if (photos.length > 0) count++;
  }
  return count;
}

/** @deprecated — use countAvailableGapDays */
export async function countGapsInRange(
  gapTarget: MagicFillGapTarget,
  existingMomentDates: Set<string>
): Promise<number> {
  return countAvailableGapDays(gapTarget, existingMomentDates);
}

export async function scanMagicFillGaps(opts: {
  gapTarget: MagicFillGapTarget;
  /** @deprecated — use gapTarget */
  daysBack?: MagicFillGapTarget;
  existingMomentDates: Set<string>;
}): Promise<MagicFillDraft[]> {
  const target = opts.gapTarget ?? opts.daysBack ?? 10;
  const drafts: MagicFillDraft[] = [];

  for (
    let i = 1;
    i <= MAGIC_FILL_MAX_SCAN_DAYS && drafts.length < target;
    i++
  ) {
    const date = subDays(new Date(), i);
    const ymd = format(date, "yyyy-MM-dd");
    if (opts.existingMomentDates.has(ymd)) continue;

    const photos = await queryCameraPhotosForLocalDay(date, {
      lightweight: false,
    });
    if (photos.length === 0) continue;

    const ranked = await rankPhotosForMagicFill(photos);
    drafts.push({
      ymd,
      date,
      photos: ranked,
      selectedIndex: 0,
      skipped: false,
      rawCaption: "",
    });
  }

  drafts.sort((a, b) => b.date.getTime() - a.date.getTime());
  return drafts;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

export async function assembleMagicFillDrafts(
  drafts: MagicFillDraft[]
): Promise<MagicFillDraft[]> {
  const active = drafts.filter((d) => !d.skipped && d.rawCaption.trim());

  const assembled = await mapWithConcurrency(active, 3, async (draft) => {
    const photo = draft.photos[draft.selectedIndex];
    try {
      const result = await callMomentAssemble({
        raw_text: draft.rawCaption.trim(),
        prompt_type: "photo",
        prompt_value: photo?.uri ?? draft.ymd,
        follow_up_answer: null,
      });
      return { ...draft, title: result.title, body: result.body };
    } catch {
      const fallbackTitle =
        draft.rawCaption.trim().split(/\s+/).slice(0, 6).join(" ") || "A moment";
      return {
        ...draft,
        title: fallbackTitle.length > 56 ? `${fallbackTitle.slice(0, 53)}…` : fallbackTitle,
        body: draft.rawCaption.trim(),
      };
    }
  });

  const byYmd = new Map(assembled.map((d) => [d.ymd, d]));
  return drafts.map((d) => byYmd.get(d.ymd) ?? d);
}

export type MagicFillSaveResult = {
  savedCount: number;
  failedYmds: string[];
  entryIds: string[];
};

export async function saveMagicFillBatch(opts: {
  drafts: MagicFillDraft[];
  userId: string;
  onProgress?: (saved: number, total: number) => void;
}): Promise<MagicFillSaveResult> {
  const toSave = opts.drafts.filter(
    (d) => !d.skipped && d.rawCaption.trim() && d.title && d.body
  );
  const entryIds: string[] = [];
  const failedYmds: string[] = [];
  let savedCount = 0;

  for (let i = 0; i < toSave.length; i++) {
    const draft = toSave[i];
    const photo = draft.photos[draft.selectedIndex];
    if (!photo) {
      failedYmds.push(draft.ymd);
      continue;
    }

    const mem = draft.date;
    const photoBucketAtSave = categorizePhotoBucket(photo.creationTime);
    const photoAgeDaysAtSave = photoAgeDays(photo.creationTime);

    try {
      const { data, error } = await supabase
        .from("entries")
        .insert({
          user_id: opts.userId,
          title: draft.title!,
          body: draft.body!,
          entry_type: "moment",
          entry_date: draft.ymd,
          entry_month: mem.getMonth() + 1,
          entry_year: mem.getFullYear(),
          date_precision: "exact",
          word_of_day: null,
          ai_conversation: null,
          ai_enhanced_body: null,
          original_body: draft.rawCaption.trim(),
          is_ai_enhanced: true,
          streak_day_number: null,
          chapter_id: null,
          photo_bucket_at_save: photoBucketAtSave,
          photo_age_days_at_save: photoAgeDaysAtSave,
        })
        .select()
        .single();

      if (error || !data) {
        failedYmds.push(draft.ymd);
        continue;
      }

      entryIds.push(data.id);
      savedCount++;
      opts.onProgress?.(savedCount, toSave.length);

      void (async () => {
        try {
          const takenAtIso = photo.creationTime
            ? new Date(photo.creationTime).toISOString()
            : null;

          const { publicUrl, storagePath } = await uploadEntryMedia(
            opts.userId,
            data.id,
            photo.uri,
            photo.mediaType === "video" ? "video" : "image"
          );

          let pairedVideoStoragePath: string | null = null;
          let pairedVideoStorageUrl: string | null = null;
          let locationName: string | null = null;
          let locationLatitude: number | null = null;
          let locationLongitude: number | null = null;

          if (photo.mediaType !== "video") {
            try {
              const paired = await getLivePhotoVideoUri(photo.id);
              if (paired?.uri) {
                const upload = await uploadEntryMedia(
                  opts.userId,
                  data.id,
                  paired.uri,
                  "video"
                );
                pairedVideoStoragePath = upload.storagePath;
                pairedVideoStorageUrl = upload.publicUrl;
              }
            } catch {
              /* optional */
            }
          }

          try {
            const geo = await getAssetGeoLocation(photo.id);
            if (geo) {
              locationLatitude = geo.latitude;
              locationLongitude = geo.longitude;
              locationName = await reverseGeocode(geo.latitude, geo.longitude);
            }
          } catch {
            /* optional */
          }

          await supabase.from("entry_media").insert({
            entry_id: data.id,
            user_id: opts.userId,
            storage_path: storagePath,
            storage_url: publicUrl,
            media_type: photo.mediaType === "video" ? "video" : "image",
            display_order: 0,
            taken_at: takenAtIso,
            paired_video_storage_path: pairedVideoStoragePath,
            paired_video_storage_url: pairedVideoStorageUrl,
            location_name: locationName,
            location_latitude: locationLatitude,
            location_longitude: locationLongitude,
          });
        } catch (err) {
          console.warn("[MagicFill] media upload failed:", err);
        }

        void supabase.functions.invoke("process-threads", {
          body: { entry_id: data.id },
        });
      })();
    } catch {
      failedYmds.push(draft.ymd);
    }
  }

  return { savedCount, failedYmds, entryIds };
}

export function formatMagicFillDate(date: Date): string {
  return format(date, "EEEE, MMM d");
}

export function formatMagicFillDateShort(date: Date): string {
  return format(date, "EEEE · MMM d");
}
