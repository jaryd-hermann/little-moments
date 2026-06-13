import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/store/authStore";

/**
 * Cold-start repair: user saved moment(s) (`total_moments`) but the profile row
 * never advanced past `notifications` (failed `finishOnboarding` write, killed
 * app mid-request, offline, etc.). Without this, `routeAfterAuth` keeps sending
 * them to the notifications screen after every reload.
 */
export function healProfileIfStuckAfterCapture(
  profile: Profile | null
): Profile | null {
  if (!profile) return null;
  if (profile.onboarding_completed) return profile;
  if (profile.onboarding_phase !== "notifications") return profile;
  if ((profile.total_moments ?? 0) < 1) return profile;

  void supabase
    .from("profiles")
    .update({
      onboarding_phase: "done",
      onboarding_completed: true,
    })
    .eq("id", profile.id)
    .then(({ error }) => {
      if (error) {
        console.error("[onboarding] healProfileIfStuckAfterCapture failed:", error);
      }
    });

  return {
    ...profile,
    onboarding_phase: "done",
    onboarding_completed: true,
  };
}

/**
 * Photo-focus onboarding router (v2 — capture in main app).
 *
 * Phase order: quiz (pre-auth) -> photo_permission -> notifications
 *   -> first-moment screen -> Capture tab (+ coachmarks).
 *
 * Paywall value-anchor + RC modal are pushed from notifications for
 * control users only when the `quiz` flag is control; test skips paywall.
 */
export function routeAfterAuth(profile: Profile | null) {
  if (!profile) {
    router.replace("/(auth)/photo-permission");
    return;
  }

  if (profile.onboarding_completed) {
    router.replace("/(tabs)/today");
    return;
  }

  const phase = profile.onboarding_phase ?? "photo_permission";

  if (phase === "done") {
    router.replace("/(tabs)/today");
    return;
  }

  switch (phase) {
    case "quiz":
      router.replace("/(auth)/photo-permission");
      break;
    case "onboarding_welcome":
      router.replace("/(auth)/photo-permission");
      break;
    case "photo_permission":
      router.replace("/(auth)/photo-permission");
      break;
    case "activation":
    case "reveal":
      router.replace("/(auth)/notifications-prompt");
      break;
    case "notifications":
      router.replace("/(auth)/notifications-prompt");
      break;

    case "resonance":
    case "follow_up":
    case "slides":
    case "personalized":
      router.replace("/(auth)/photo-permission");
      break;
    case "donation":
    case "trial":
    case "story_coach":
      router.replace("/(auth)/notifications-prompt");
      break;

    default:
      router.replace("/(auth)/photo-permission");
  }
}

export function routeToFirstMomentScreen() {
  router.replace("/(auth)/first-moment");
}
