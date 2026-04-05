import { useCallback, useRef } from "react";
import { router } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import { useStreak } from "@/hooks/useStreak";
import { useChapters } from "@/hooks/useChapters";

/**
 * Checks whether the paywall upgrade flow should be triggered.
 * Conditions: streak >= 7 OR first chapter delivered, AND user is not subscribed.
 * Dismissal is tracked per-session to avoid spamming.
 */
export function usePaywallTrigger() {
  const profile = useAuthStore((s) => s.profile);
  const { streakCount } = useStreak();
  const { latestChapter } = useChapters();
  const dismissedRef = useRef(false);

  const isSubscribed =
    profile?.subscription_status === "active";

  const shouldTrigger =
    !isSubscribed &&
    !dismissedRef.current &&
    (streakCount >= 7 || !!latestChapter);

  const triggerPaywall = useCallback(() => {
    if (!shouldTrigger) return;
    router.push("/paywall/upgrade");
  }, [shouldTrigger]);

  const dismissPaywall = useCallback(() => {
    dismissedRef.current = true;
  }, []);

  return { shouldTrigger, triggerPaywall, dismissPaywall };
}
