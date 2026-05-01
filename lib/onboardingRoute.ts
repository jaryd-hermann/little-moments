import { router } from "expo-router";
import type { Profile } from "@/store/authStore";

export function routeAfterAuth(profile: Profile | null) {
  if (!profile) {
    router.replace("/(auth)/resonance");
    return;
  }

  if (profile.onboarding_completed) {
    router.replace("/(tabs)/capture");
    return;
  }

  const phase = profile.onboarding_phase ?? "resonance";

  if (phase === "done") {
    router.replace("/(tabs)/capture");
    return;
  }

  switch (phase) {
    case "personalized":
      router.replace("/(auth)/personalized");
      break;
    case "activation":
      router.replace("/(auth)/activation");
      break;
    case "notifications":
      router.replace("/(auth)/notifications-prompt");
      break;

    // Legacy phases — map to nearest v2 equivalent
    case "follow_up":
    case "slides":
      router.replace("/(auth)/personalized");
      break;
    case "donation":
    case "trial":
    case "story_coach":
      router.replace("/(auth)/activation");
      break;

    case "resonance":
    default:
      router.replace("/(auth)/resonance");
  }
}
