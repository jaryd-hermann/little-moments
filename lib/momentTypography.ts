import type { TextStyle } from "react-native";

/** Splash onboarding hero headline — used for moment titles app-wide. */
export const MOMENT_TITLE_FONT = "Roboto-Bold";

export function momentTitleStyle(
  overrides: TextStyle = {}
): TextStyle {
  return {
    fontFamily: MOMENT_TITLE_FONT,
    ...overrides,
  };
}

export const PHOTO_CARD_BORDER_WIDTH = 2;

/** Photo-picker / moment card stroke — pass `colors.text` (black in light, white in dark). */
export function photoCardBorder(borderColor: string) {
  return {
    borderWidth: PHOTO_CARD_BORDER_WIDTH,
    borderColor,
  };
}
