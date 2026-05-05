import { useColorScheme } from "react-native";
import { useSettingsStore, type ThemePreference } from "@/store/settingsStore";
import { Colors } from "@/constants/Colors";
import type { AccentColor } from "@/constants/Colors";

export type ResolvedTheme = "light" | "dark";

/**
 * Resolves the user's appearance preference into a concrete light/dark mode.
 *
 * - `"light" | "dark"` → that mode
 * - `"system"` → follow the device's current colour scheme (defaults to
 *   `"light"` if the OS hasn't reported one yet, which only happens before
 *   the very first paint on web / older RN versions).
 *
 * Returns:
 *  - `theme`            → resolved `"light"` or `"dark"`
 *  - `themePreference`  → raw user choice (`"light" | "dark" | "system"`)
 *  - `colors`           → palette built for `theme`
 *  - `setTheme`         → mutator that accepts the preference (light/dark/system)
 *  - `accentColor`/`setAccentColor` → unchanged accent helpers
 */
export function useTheme() {
  const systemScheme = useColorScheme();
  const themePreference = useSettingsStore((s) => s.theme) as ThemePreference;
  const setTheme = useSettingsStore((s) => s.setTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

  const theme: ResolvedTheme =
    themePreference === "system"
      ? (systemScheme ?? "light")
      : themePreference;
  const colors = Colors.buildTheme(theme, accentColor);

  return { theme, themePreference, colors, setTheme, accentColor, setAccentColor };
}

export type { ThemePreference, AccentColor };
