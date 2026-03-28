import { useColorScheme } from "react-native";
import { useSettingsStore } from "@/store/settingsStore";
import { Colors } from "@/constants/Colors";
import type { AccentColor } from "@/constants/Colors";

export function useTheme() {
  const systemScheme = useColorScheme();
  const storeTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

  const theme = storeTheme ?? systemScheme ?? "dark";
  const colors = Colors.buildTheme(theme, accentColor);

  return { theme, colors, setTheme, accentColor, setAccentColor };
}
