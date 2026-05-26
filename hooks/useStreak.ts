import { useMemo } from "react";
import { useEntryStore } from "@/store/entryStore";
import { useAuthStore } from "@/store/authStore";
import {
  calculateStreak,
  countMemoryRaces,
  averageMomentWordCount,
  computeLongestStreakEver,
  countMomentEntries,
  habitStreakCalendarDates,
  habitStreakDayKeys,
} from "@/lib/streak";

/** Snapshot after a save completes (reads Zustand stores synchronously). */
export type AfterSaveStats = {
  streakCount: number;
  totalMoments: number;
};

/** Passed to `afterSaveNode` so post-save UI can target the new entry. */
export type AfterSaveContext = {
  savedEntryId: string | null;
};

export function getStreakDisplayFromStores(): AfterSaveStats {
  const entries = useEntryStore.getState().entries;
  const profile = useAuthStore.getState().profile;
  const habitDates = habitStreakCalendarDates(entries);
  const streakData = calculateStreak(habitDates);
  const totalMomentsFromEntries = countMomentEntries(entries);
  const totalMoments = Math.max(
    profile?.total_moments ?? 0,
    totalMomentsFromEntries
  );
  return {
    streakCount: streakData.streakCount,
    totalMoments,
  };
}

export function useStreak() {
  const entries = useEntryStore((s) => s.entries);
  const profile = useAuthStore((s) => s.profile);

  const streakData = useMemo(() => {
    return calculateStreak(habitStreakCalendarDates(entries));
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
    () => computeLongestStreakEver(habitStreakDayKeys(entries)),
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
