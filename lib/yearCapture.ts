/** Enough of an entry to count it — anything with a type and a date qualifies. */
interface EntryForYearCapture {
  entry_type: string;
  entry_date?: string | null;
}

export interface YearCaptureProgress {
  year: number;
  /** Distinct days this year carrying at least one moment. */
  capturedDays: number;
  /** Jan 1 through today, inclusive. Never below 1, so the ratio is safe. */
  daysElapsed: number;
  /** `capturedDays / daysElapsed`, 0–1. */
  ratio: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * How much of the year they've captured: distinct days with a moment ÷ days
 * elapsed. Measured against elapsed days rather than all 365 so the number
 * reflects the run they're on instead of sitting near zero until December.
 *
 * Shared by the Capture page, its day picker and the Capsule, so the same
 * percentage can't read three different ways.
 */
export function yearCaptureProgress(
  entries: readonly EntryForYearCapture[],
  now: Date = new Date()
): YearCaptureProgress {
  const year = now.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const today = new Date(year, now.getMonth(), now.getDate());
  const daysElapsed = Math.max(
    1,
    Math.round((today.getTime() - yearStart.getTime()) / MS_PER_DAY) + 1
  );

  const yearPrefix = String(year);
  const captured = new Set<string>();
  for (const e of entries) {
    if (e.entry_type !== "moment" || !e.entry_date) continue;
    if (!e.entry_date.startsWith(yearPrefix)) continue;
    captured.add(e.entry_date);
  }

  return {
    year,
    capturedDays: captured.size,
    daysElapsed,
    ratio: captured.size / daysElapsed,
  };
}
