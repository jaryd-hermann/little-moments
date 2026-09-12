import type { TextStyle } from "react-native";

export const MAGIC_FILL_HEADLINE_FONT = "PMGothicLudington-Text110";

export function magicFillHeadlineStyle(overrides: TextStyle = {}): TextStyle {
  return {
    fontFamily: MAGIC_FILL_HEADLINE_FONT,
    ...overrides,
  };
}

/** Date pill on review cards — gold fill, black stroke. */
export const MAGIC_FILL_DATE_PILL = {
  backgroundColor: "#FFC100",
  borderWidth: 2,
  borderColor: "#000000",
} as const;

/** Magic Fill primary CTA + done-badge fill — always pink, not user accent. */
export const MAGIC_FILL_CTA_FILL = "#F0D7FF";
