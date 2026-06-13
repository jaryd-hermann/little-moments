import type { MagicFillGapTarget } from "@/store/magicFillStore";

/** How far back we scan the camera roll when hunting for gap days. */
export const MAGIC_FILL_MAX_SCAN_DAYS = 3650;

export function isGapCountCacheValid(
  cache: { count: number; gapTarget: MagicFillGapTarget; at: number } | null,
  gapTarget: MagicFillGapTarget
): boolean {
  if (!cache) return false;
  if (cache.gapTarget !== gapTarget) return false;
  return Date.now() - cache.at < 5 * 60 * 1000;
}
