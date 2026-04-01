import { router } from "expo-router";
import type { Profile } from "@/store/authStore";

export function routeAfterAuth(profile: Profile | null) {
  if (!profile) {
    router.replace("/(auth)/resonance");
    return;
  }

  if (profile.onboarding_completed) {
    router.replace("/(tabs)/today");
    return;
  }

  const phase = profile.onboarding_phase ?? "resonance";

  if (phase === "done") {
    router.replace("/(tabs)/today");
    return;
  }

  switch (phase) {
    case "follow_up":
      router.replace("/(auth)/follow-up");
      break;
    case "slides":
      router.replace("/(auth)/onboarding");
      break;
    case "donation":
      router.replace("/(auth)/donation");
      break;
    case "trial":
      router.replace("/(auth)/trial");
      break;
    case "notifications":
      router.replace("/(auth)/notifications-prompt");
      break;
    case "resonance":
    default:
      router.replace("/(auth)/resonance");
  }
}
