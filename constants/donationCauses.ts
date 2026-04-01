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

export const CAUSE_IMAGES: Record<string, ImageSourcePropType> = {
  environment: require("@/assets/images/causes/environment.png"),
  research: require("@/assets/images/causes/research.png"),
  "mental-health": require("@/assets/images/causes/mental-health.png"),
  education: require("@/assets/images/causes/education.png"),
  animals: require("@/assets/images/causes/animals.png"),
  health: require("@/assets/images/causes/health.png"),
};
