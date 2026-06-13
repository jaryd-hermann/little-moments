import { format, subDays } from "date-fns";
import type { Profile } from "@/store/authStore";
import type { Entry } from "@/store/entryStore";

export type ReflectionTarget = "yesterday" | "today";

export function defaultReflectionTarget(
  profile: Profile | null
): ReflectionTarget {
  const t = profile?.reflection_target_default;
  if (t === "today" || t === "yesterday") return t;
  if (profile?.capture_rhythm === "evening") return "today";
  return "yesterday";
}

export function calendarDateForReflectionTarget(
  target: ReflectionTarget,
  now: Date = new Date()
): Date {
  const base = target === "yesterday" ? subDays(now, 1) : now;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate());
}

/** Parse `yyyy-MM-dd` route params into a local calendar `Date`. */
export function parseCaptureDayYmd(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [, y, mo, d] = m;
  const targetDate = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(targetDate.getTime())) return null;
  targetDate.setHours(0, 0, 0, 0);
  return targetDate;
}

export function reflectionTargetLabel(target: ReflectionTarget): string {
  return target === "yesterday" ? "Yesterday" : "Today";
}

export function captureScreenHeading(
  captureTargetDate: Date,
  _now: Date = new Date()
): { title: string; subtitle: string; titleSecondary: string } {
  return {
    title: format(captureTargetDate, "EEE"),
    subtitle: format(captureTargetDate, "MMM d, yyyy"),
    titleSecondary: format(captureTargetDate, ", MMM d"),
  };
}

/** Label for the calendar day a moment is *for* (`entry_date`), not when it was saved. */
export function entryMomentDayHeadingText(
  entry: Pick<Entry, "entry_date" | "entry_year">,
  now: Date = new Date()
): string {
  if (!entry.entry_date) {
    return entry.entry_year ? String(entry.entry_year) : "";
  }
  const d = new Date(`${entry.entry_date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const h = captureScreenHeading(d, now);
  return `${h.title} · ${h.subtitle}`;
}
