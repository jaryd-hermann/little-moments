export const ACCENT_PALETTES = {
  pink: { primary: "#f0d7ff", primaryLight: "#f5e6ff", primaryDark: "#d4a8f0" },
  orange: { primary: "#E8734A", primaryLight: "#F09070", primaryDark: "#C95E38" },
} as const;

export type AccentColor = keyof typeof ACCENT_PALETTES;

function buildTheme(mode: "light" | "dark", accent: AccentColor) {
  const brand = ACCENT_PALETTES[accent];

  if (mode === "light") {
    return {
      text: "#1A1A1A",
      textSecondary: "rgba(0, 0, 0, 0.6)",
      textMuted: "rgba(0, 0, 0, 0.4)",
      background: "#FFFFEB",
      surface: "#FFFFEB",
      surfaceSecondary: "#F5F5E4",
      border: "rgba(0, 0, 0, 0.15)",
      borderLight: "rgba(0, 0, 0, 0.08)",
      icon: "rgba(0, 0, 0, 0.6)",
      tabIconDefault: "rgba(0, 0, 0, 0.4)",
      tabIconSelected: "#1A1A1A",
      primary: brand.primary,
      primaryLight: brand.primaryLight,
      destructive: "#EF4444",
      success: "#10B981",
      warning: "#F59E0B",
    };
  }

  return {
    text: "#FFFFFF",
    textSecondary: "rgba(255, 255, 255, 0.7)",
    textMuted: "rgba(255, 255, 255, 0.4)",
    background: "#000000",
    surface: "#0A0A0A",
    surfaceSecondary: "#1A1A1A",
    border: "rgba(255, 255, 255, 0.1)",
    borderLight: "rgba(255, 255, 255, 0.05)",
    icon: "rgba(255, 255, 255, 0.7)",
    tabIconDefault: "rgba(255, 255, 255, 0.4)",
    tabIconSelected: "#FFFFFF",
    primary: brand.primary,
    primaryLight: brand.primaryLight,
    destructive: "#EF4444",
    success: "#10B981",
    warning: "#F59E0B",
  };
}

export const Colors = {
  light: buildTheme("light", "pink"),
  dark: buildTheme("dark", "pink"),
  buildTheme,
};
