/**
 * Thread discovery thresholds — keep process-threads and cron-threads-nightly
 * in sync via this module.
 *
 * Tuning notes (2026-06-11): raised again because threads were still surfacing
 * too often (~1 per save). text-embedding-3-large p90 pair similarity is ~0.49;
 * 0.58 surfaces roughly the top ~2–3% of pairs. Claude then applies
 * MIN_CONFIDENCE on top — most pairs should still fail.
 */
export const MIN_SIMILARITY = 0.58;
export const MIN_CONFIDENCE = 0.85;
/** Minimum calendar gap between connected entries (photo/journal date). */
export const MIN_DAY_GAP = 14;
/** Fewer candidates → less noise sent to Claude, lower cost. */
export const MAX_CANDIDATES = 5;

/** Max threads surfaced per user per rolling 7 days (all sources combined). */
export const REALTIME_WEEKLY_THREAD_LIMIT = 2;

/** Cron-only pacing — per-run cap on top of the weekly limit. */
export const CRON_WEEKLY_THREAD_LIMIT = REALTIME_WEEKLY_THREAD_LIMIT;
export const CRON_PER_RUN_THREAD_LIMIT = 1;
