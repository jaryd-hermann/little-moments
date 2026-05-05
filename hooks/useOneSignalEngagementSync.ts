import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";
import {
  syncOneSignalEngagementTags,
  syncOneSignalScheduleTags,
} from "@/lib/onesignal";

/**
 * Push streak / pin / schedule tags to OneSignal so dashboard segments
 * can target without round-tripping through the Supabase profile.
 *
 * Mirrors `useOneSignalMomentSync` — same pattern of "max of profile
 * value and live store value" so the local change reflects immediately
 * after a save without waiting for the server round-trip.
 *
 * Server-side `cron-onesignal-sync` covers users who haven't opened the
 * app recently; this hook keeps active users fresh in real time.
 */
export function useOneSignalEngagementSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const profileStreak = useAuthStore((s) => s.profile?.streak_count ?? 0);
  const profileTimezone = useAuthStore(
    (s) => s.profile?.notification_timezone ?? null,
  );
  const profileNotificationTime = useAuthStore(
    (s) => s.profile?.notification_time ?? null,
  );

  const livePinnedCount = useEntryStore(
    (s) =>
      s.entries.filter((e) => e.entry_type === "moment" && e.is_pinned).length,
  );

  useEffect(() => {
    if (!userId) return;
    syncOneSignalEngagementTags({
      currentStreak: profileStreak,
      totalPinned: livePinnedCount,
    });
  }, [userId, profileStreak, livePinnedCount]);

  useEffect(() => {
    if (!userId) return;
    syncOneSignalScheduleTags({
      timezone: profileTimezone,
      notificationTime: profileNotificationTime,
    });
  }, [userId, profileTimezone, profileNotificationTime]);
}
