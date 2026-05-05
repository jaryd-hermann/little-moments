import {
  differenceInCalendarDays,
  parseISO,
} from "date-fns";
import { supabase } from "./supabase";
import { notifyLifecycleEvent } from "./lifecycleEvent";
import { captureException } from "./errors";

const STREAK_MILESTONES = new Set([3, 7, 30, 100]);

type EntryForStats = {
  entry_type: string;
  body: string;
};

export function countMemoryRaces(entries: EntryForStats[]): number {
  return entries.filter((e) => e.entry_type === "crash_and_burn").length;
}

/** Average word count of moment entries (excluding memory races). */
export function averageMomentWordCount(entries: EntryForStats[]): number {
  const moments = entries.filter((e) => e.entry_type === "moment");
  if (moments.length === 0) return 0;
  const total = moments.reduce((sum, e) => {
    const words = e.body.trim().split(/\s+/).filter(Boolean).length;
    return sum + words;
  }, 0);
  return Math.round(total / moments.length);
}

export function calculateStreak(entryDates: Date[]): {
  streakCount: number;
  isAtRisk: boolean;
  isAlive: boolean;
} {
  if (entryDates.length === 0)
    return { streakCount: 0, isAtRisk: false, isAlive: false };

  const sortedDates = [...entryDates].sort(
    (a, b) => b.getTime() - a.getTime()
  );
  const lastEntry = sortedDates[0];
  const today = new Date();
  const daysSinceLastEntry = differenceInCalendarDays(today, lastEntry);

  const hasEntryToday = daysSinceLastEntry === 0;
  const isAlive = daysSinceLastEntry <= 1;
  const isAtRisk = !hasEntryToday && daysSinceLastEntry === 1;

  if (!isAlive) return { streakCount: 0, isAtRisk: false, isAlive: false };

  let streak = 0;
  let checkDate = hasEntryToday ? today : lastEntry;

  for (const date of sortedDates) {
    const dayDiff = differenceInCalendarDays(checkDate, date);
    if (dayDiff === 0) {
      // Same day — continue
    } else if (dayDiff === 1) {
      streak++;
      checkDate = date;
    } else {
      break;
    }
  }
  streak++; // Count the starting day

  return { streakCount: streak, isAtRisk, isAlive };
}

/** Longest run of consecutive calendar days with an entry (any type). */
export function computeLongestStreakEver(
  entryDatesYyyyMmDd: string[]
): number {
  if (entryDatesYyyyMmDd.length === 0) return 0;
  const dayKeys = [...new Set(entryDatesYyyyMmDd)].sort();
  let maxLen = 1;
  let run = 1;
  for (let i = 1; i < dayKeys.length; i++) {
    const a = parseISO(dayKeys[i - 1]);
    const b = parseISO(dayKeys[i]);
    if (differenceInCalendarDays(b, a) === 1) {
      run += 1;
      maxLen = Math.max(maxLen, run);
    } else {
      run = 1;
    }
  }
  return maxLen;
}

export function countMomentEntries(
  entries: { entry_type: string }[]
): number {
  return entries.filter((e) => e.entry_type === "moment").length;
}

export function exactEntryDateKeys(
  entries: { date_precision: string; entry_date: string | null }[]
): string[] {
  return entries
    .filter((e) => e.date_precision === "exact" && e.entry_date)
    .map((e) => e.entry_date as string);
}

export async function updateStreakAfterEntry(
  userId: string
): Promise<void> {
  try {
    const { data: entries } = await supabase
      .from("entries")
      .select("entry_date")
      .eq("user_id", userId)
      .eq("date_precision", "exact")
      .not("entry_date", "is", null)
      .order("entry_date", { ascending: false })
      .limit(60);

    const dates =
      entries?.map((e) => {
        const [y, m, d] = (e.entry_date as string).split("-").map(Number);
        return new Date(y, m - 1, d);
      }) ?? [];
    const { streakCount } = calculateStreak(dates);

    const { data: profile } = await supabase
      .from("profiles")
      .select("longest_streak, total_moments, streak_count")
      .eq("id", userId)
      .single();

    await supabase
      .from("profiles")
      .update({
        streak_count: streakCount,
        longest_streak: Math.max(
          streakCount,
          profile?.longest_streak ?? 0
        ),
        last_entry_date: new Date().toISOString().split("T")[0],
        total_moments: (profile?.total_moments ?? 0) + 1,
      })
      .eq("id", userId);

    // Fire a streak-milestone lifecycle push only when the streak just
    // crossed into a milestone bucket — i.e. previous streak was below
    // the milestone, current streak hits it. Server re-checks the count
    // and enforces one-shot via lifecycle_dispatches.
    const previousStreak = profile?.streak_count ?? 0;
    if (STREAK_MILESTONES.has(streakCount) && previousStreak < streakCount) {
      void notifyLifecycleEvent("streak_milestone");
    }
  } catch (err) {
    // Streak update is best-effort: if the counter doesn't tick, the
    // user still has their entry. But we MUST surface failures because
    // a silently-broken streak counter cascades into weekly chapters,
    // milestone pushes, and on-this-day eligibility.
    captureException(err, {
      where: "updateStreakAfterEntry",
      user_id: userId,
    });
    throw err;
  }
}
