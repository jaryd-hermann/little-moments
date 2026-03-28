import { useMemo } from "react";
import { useEntryStore } from "@/store/entryStore";
import { useAuthStore } from "@/store/authStore";
import { calculateStreak } from "@/lib/streak";

export function useStreak() {
  const entries = useEntryStore((s) => s.entries);
  const profile = useAuthStore((s) => s.profile);

  const streakData = useMemo(() => {
    const exactDates = entries
      .filter((e) => e.date_precision === "exact" && e.entry_date)
      .map((e) => new Date(e.entry_date!));
    return calculateStreak(exactDates);
  }, [entries]);

  return {
    streakCount: streakData.streakCount,
    isAtRisk: streakData.isAtRisk,
    isAlive: streakData.isAlive,
    longestStreak: profile?.longest_streak ?? 0,
    totalMoments: profile?.total_moments ?? 0,
  };
}
