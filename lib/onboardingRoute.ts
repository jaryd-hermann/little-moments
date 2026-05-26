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
 * Photo-focus + quiz v1 onboarding router.
 *
 * Phase order: quiz (pre-auth) -> photo_permission -> activation -> reveal
 *   -> notifications -> done (with the paywall value-anchor + RC modal
 *   pushed from notifications-prompt after the rhythm pick).
 *
 * Legacy v2 phases (resonance / personalized / donation / trial / etc.) are
 * bridged to the closest current step so in-flight users don't get stuck.
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
      // Defensive bridge — shouldn't normally happen because the quiz
      // runs pre-auth and the post-auth flush writes 'photo_permission'.
      // If a session is somehow on 'quiz' (e.g. flush failed silently),
      // skip past the quiz to photo permission rather than restarting it
      // post-auth, which would feel broken.
      router.replace("/(auth)/photo-permission");
      break;
    case "onboarding_welcome":
      router.replace("/(auth)/onboarding-welcome");
      break;
    case "photo_permission":
      router.replace("/(auth)/photo-permission");
      break;
    case "activation":
      router.replace("/(auth)/activation");
      break;
    case "reveal":
      router.replace("/(auth)/reveal");
      break;
    case "notifications":
      router.replace("/(auth)/notifications-prompt");
      break;

    // Legacy v2 phases — bridge mid-flow users to the closest current step.
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
