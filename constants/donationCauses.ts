import type { ImageSourcePropType } from "react-native";

export type DonationCause = {
  id: string;
  title: string;
  category_label: string;
  org_name: string;
  description: string;
  donation_link: string;
  image_key: string;
  sort_order: number;
};

// Cause artwork was removed to save app space. The grid renders a colored
// fallback card (see `CAUSE_FALLBACK_COLORS`) when a key has no image. Re-add
// entries here (and the PNGs under assets/images/causes) to restore artwork.
export const CAUSE_IMAGES: Record<string, ImageSourcePropType> = {};

/** Background colors used when a cause has no bundled image. */
export const CAUSE_FALLBACK_COLORS: Record<string, string> = {
  environment: "#2E7D5B",
  research: "#3B5BA5",
  "mental-health": "#7B5EA7",
  education: "#C9772E",
  animals: "#A85638",
  health: "#B83C5E",
};

const DEFAULT_CAUSE_COLOR = "#5A5A6E";

/** Deterministic fallback color for a cause image key. */
export function causeFallbackColor(imageKey: string): string {
  return CAUSE_FALLBACK_COLORS[imageKey] ?? DEFAULT_CAUSE_COLOR;
}
