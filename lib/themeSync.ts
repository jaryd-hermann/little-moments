import { useSettingsStore } from "@/store/settingsStore";
import type { ThemePreference } from "@/store/settingsStore";
import type { Profile } from "@/store/authStore";

/**
 * Hydrate the local appearance preference from the user's persisted profile
 * row. Called on every successful sign-in / app-open path so a user who set
 * their theme on one device picks the same up on another.
 *
 * Unknown / nullish values fall back to "system" so we follow the device.
 *
 * While `onboarding_completed === false`, we **do not** apply `color_theme`
 * from the server. Legacy rows often still had `dark`; that overwrote a fresh
 * install's `"system"` + light device right after sign-in so photo-permission
 * and other onboarding screens looked black while sign-in looked light. During
 * onboarding the app should follow the local preference (usually system).
 */
export function applyThemeFromProfile(
  colorTheme: string | null | undefined,
  profile?: Pick<Profile, "onboarding_completed"> | null
): void {
  if (profile != null && profile.onboarding_completed === false) {
    return;
  }
  let next: ThemePreference;
  if (colorTheme === "light" || colorTheme === "dark" || colorTheme === "system") {
    next = colorTheme;
  } else {
    next = "system";
  }
  const current = useSettingsStore.getState().theme;
  if (current === next) return;
  useSettingsStore.getState().setTheme(next);
}
