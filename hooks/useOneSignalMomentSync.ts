import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";
import { syncOneSignalMomentTags } from "@/lib/onesignal";

/**
 * Push the current user's lifetime moment count to OneSignal so dashboard
 * segments (e.g. "Activated: has_captured_moment = true", "Power user:
 * total_moments >= 30") can target campaigns without round-tripping the
 * Supabase `profiles` table.
 *
 * Source of truth resolution:
 *   - `profile.total_moments` is authoritative on cold start (set when
 *     `routeAfterAuth` loads the row).
 *   - `entries[].entry_type === "moment"` is the live count after a save —
 *     `useEntries.saveEntry` calls `addEntry` synchronously while the
 *     profile DB row update from `updateStreakAfterEntry` doesn't
 *     round-trip back into the local profile this session, so the entries
 *     store reflects the new total before the profile does.
 *
 * Taking the max of the two keeps the OneSignal tag monotonically
 * increasing and ensures the very first capture flips
 * `has_captured_moment = true` in real time.
 */
export function useOneSignalMomentSync(): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const profileTotalMoments = useAuthStore(
    (s) => s.profile?.total_moments ?? 0
  );
  const liveMomentCount = useEntryStore(
    (s) => s.entries.filter((e) => e.entry_type === "moment").length
  );

  useEffect(() => {
    if (!userId) return;
    const total = Math.max(profileTotalMoments, liveMomentCount);
    syncOneSignalMomentTags(total);
  }, [userId, profileTotalMoments, liveMomentCount]);
}
