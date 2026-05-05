import { router } from "expo-router";
import type { Profile } from "@/store/authStore";

/**
 * Photo-focus v3 onboarding router.
 *
 * Phase order: photo_permission -> activation -> reveal -> notifications -> done.
 * Legacy v2 phases (resonance / personalized / donation / trial / etc.) are
 * bridged to the closest v3 step so in-flight users don't get stuck.
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

    // Legacy v2 phases — bridge mid-flow users to the closest v3 step.
    case "resonance":
    case "follow_up":
    case "slides":
    case "personalized":
      router.replace("/(auth)/photo-permission");
      break;
    case "donation":
    case "trial":
    case "story_coach":
      router.replace("/(auth)/activation");
      break;

    default:
      router.replace("/(auth)/photo-permission");
  }
}
