import {
  differenceInHours,
  differenceInCalendarDays,
  isToday,
} from "date-fns";
import { supabase } from "./supabase";

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
  const hoursSinceLastEntry = differenceInHours(new Date(), lastEntry);

  const hasEntryToday = sortedDates.some((d) => isToday(d));
  const isAlive = hasEntryToday || hoursSinceLastEntry <= 36;
  const isAtRisk =
    !hasEntryToday &&
    hoursSinceLastEntry > 24 &&
    hoursSinceLastEntry <= 36;

  if (!isAlive) return { streakCount: 0, isAtRisk: false, isAlive: false };

  let streak = 0;
  let checkDate = hasEntryToday ? new Date() : lastEntry;

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

export async function updateStreakAfterEntry(
  userId: string
): Promise<void> {
  const { data: entries } = await supabase
    .from("entries")
    .select("entry_date")
    .eq("user_id", userId)
    .eq("date_precision", "exact")
    .not("entry_date", "is", null)
    .order("entry_date", { ascending: false })
    .limit(60);

  const dates =
    entries?.map((e) => new Date(e.entry_date as string)) ?? [];
  const { streakCount } = calculateStreak(dates);

  const { data: profile } = await supabase
    .from("profiles")
    .select("longest_streak, total_moments")
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
}
