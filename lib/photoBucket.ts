/**
 * Photo recency buckets used by the random photo picker, the in-app analytics
 * (`photo_shown`, `photo_shuffled`, `moment_saved`), and the persisted save
 * context (`entries.photo_bucket_at_save`).
 *
 * Bucket boundaries (inclusive of the upper edge):
 *   - recent    : 0–90  days old   (≤ 3 months)
 *   - older     : 91–365 days old  (> 3 months, ≤ 12 months)
 *   - throwback : 366+ days old    (> 12 months)
 *
 * The shuffle cycle below biases discovery toward recent photos 3:1:1 — we
 * surface 3 recent photos for every 1 older and 1 throwback. The cycle is
 * deterministic and module-scoped (not per-user), advancing once per pick.
 */

export type PhotoBucket = "recent" | "older" | "throwback";

export const PHOTO_BUCKET_RECENT_MAX_DAYS = 90;
export const PHOTO_BUCKET_OLDER_MAX_DAYS = 365;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PHOTO_BUCKET_RECENT_MAX_MS = PHOTO_BUCKET_RECENT_MAX_DAYS * MS_PER_DAY;
export const PHOTO_BUCKET_OLDER_MAX_MS = PHOTO_BUCKET_OLDER_MAX_DAYS * MS_PER_DAY;

/** [recent, recent, recent, older, throwback] — cycles indefinitely. */
export const PHOTO_BUCKET_CYCLE: readonly PhotoBucket[] = [
  "recent",
  "recent",
  "recent",
  "older",
  "throwback",
] as const;

/** Days between `creationTimeMs` and now. Floor of the day delta, never negative. */
export function photoAgeDays(
  creationTimeMs: number,
  nowMs: number = Date.now()
): number {
  const diffMs = Math.max(0, nowMs - creationTimeMs);
  return Math.floor(diffMs / MS_PER_DAY);
}

/** Year the photo was originally taken (e.g. 2019). Falls back to current year on bad input. */
export function photoYear(
  creationTimeMs: number,
  nowMs: number = Date.now()
): number {
  if (!Number.isFinite(creationTimeMs) || creationTimeMs <= 0) {
    return new Date(nowMs).getFullYear();
  }
  return new Date(creationTimeMs).getFullYear();
}

/** Map a photo's creation timestamp to its bucket. */
export function categorizePhotoBucket(
  creationTimeMs: number,
  nowMs: number = Date.now()
): PhotoBucket {
  const days = photoAgeDays(creationTimeMs, nowMs);
  if (days <= PHOTO_BUCKET_RECENT_MAX_DAYS) return "recent";
  if (days <= PHOTO_BUCKET_OLDER_MAX_DAYS) return "older";
  return "throwback";
}
