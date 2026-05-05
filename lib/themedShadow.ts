import type { ResolvedTheme } from "@/hooks/useTheme";

/**
 * Style block for the offset "bevel" shadow used on the app's primary CTAs
 * — Capture another, Continue, Turn on notifications, the chapter / brain
 * primaries, the Ellie mic button, etc.
 *
 * The shadow is a hard, opaque drop (0px blur, 5px offset) that reads as a
 * stacked second card under the button. The colour has to match the screen
 * background to land:
 *
 *   - In dark mode the screen is `#000000` and the bevel is the warm beige
 *     `#FFFFEB` that the brand uses for ink.
 *   - In light mode the screen is `#FFFFEB` and the bevel inverts to the
 *     same near-black ink colour the button border uses.
 *
 * Centralising it here keeps the six current call-sites in lockstep when we
 * tune the offset, and removes the silent "invisible bevel in light mode"
 * bug we had when the colour was hardcoded.
 */
export function bevelShadow(theme: ResolvedTheme) {
  return {
    shadowColor: theme === "dark" ? "#FFFFEB" : "#1A1A1A",
    shadowOffset: { width: 0, height: 5 } as const,
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  };
}

/**
 * Foreground colour to use on top of the brand pink CTA fill
 * (`colors.primary`).
 *
 * Pink (`#f0d7ff`) is a light tint, so dark/near-black ink is the only legible
 * choice in either theme — flipping to white in dark mode would turn the
 * label invisible. Centralising this avoids a ton of scattered `"#1A1A1A"`
 * literals and makes intent explicit when reading style blocks.
 */
export const PINK_CTA_INK = "#1A1A1A";

/**
 * Stroke colour for the pink CTA's outer border. Always pure black so it
 * matches the bevel underneath in light mode, and reads the same way the
 * dark-mode CTAs already did before theming work began.
 */
export const PINK_CTA_BORDER = "#000000";
