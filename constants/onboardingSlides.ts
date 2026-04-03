import type { ImageSourcePropType } from "react-native";

export type OnboardingSlideDef = {
  id: number;
  image: ImageSourcePropType;
};

/** Full-bleed slides after resonance / follow-up, before trial & paywall. */
export const ONBOARDING_SLIDES: OnboardingSlideDef[] = [
  { id: 1, image: require("@/assets/images/onboard-1.png") },
  { id: 2, image: require("@/assets/images/onboard-2.png") },
  { id: 3, image: require("@/assets/images/onboard-3.png") },
  { id: 4, image: require("@/assets/images/onboard-4.png") },
  { id: 5, image: require("@/assets/images/onboard-5.png") },
  { id: 6, image: require("@/assets/images/onboard-6.png") },
  { id: 7, image: require("@/assets/images/onboard-7.png") },
];
