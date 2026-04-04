import { useMemo } from "react";
import { useEntryStore } from "@/store/entryStore";
import { useAuthStore } from "@/store/authStore";
import {
  calculateStreak,
  countMemoryRaces,
  averageMomentWordCount,
  computeLongestStreakEver,
  countMomentEntries,
  exactEntryDateKeys,
} from "@/lib/streak";

export function useStreak() {
  const entries = useEntryStore((s) => s.entries);
  const profile = useAuthStore((s) => s.profile);

  const streakData = useMemo(() => {
    const exactDates = entries
      .filter((e) => e.date_precision === "exact" && e.entry_date)
      .map((e) => {
        const [y, m, d] = e.entry_date!.split("-").map(Number);
        return new Date(y, m - 1, d);
      });
    return calculateStreak(exactDates);
  }, [entries]);

  const memoryRaceCount = useMemo(
    () => countMemoryRaces(entries),
    [entries]
  );
  const avgStoryLengthWords = useMemo(
    () => averageMomentWordCount(entries),
    [entries]
  );

  const totalMomentsFromEntries = useMemo(
    () => countMomentEntries(entries),
    [entries]
  );

  const longestFromEntries = useMemo(
    () => computeLongestStreakEver(exactEntryDateKeys(entries)),
    [entries]
  );

  return {
    streakCount: streakData.streakCount,
    isAtRisk: streakData.isAtRisk,
    isAlive: streakData.isAlive,
    longestStreak: Math.max(
      profile?.longest_streak ?? 0,
      longestFromEntries
    ),
    totalMoments: Math.max(
      profile?.total_moments ?? 0,
      totalMomentsFromEntries
    ),
    memoryRaceCount,
    avgStoryLengthWords,
  };
}
