import { create } from "zustand";
import type { CaptureMagicFillBannerVariant } from "@/components/magic-fill/CaptureMagicFillOnboardingBanner";

interface MagicFillDevStore {
  /** Show the post-capture onboarding banner on Capture (dev preview). */
  forceOnboardingBanner: boolean;
  toggleForceOnboardingBanner: () => void;
  /** Which variant to show when force is on. */
  forceOnboardingVariant: CaptureMagicFillBannerVariant;
  setForceOnboardingVariant: (variant: CaptureMagicFillBannerVariant) => void;
  /** Treat Magic Fill as incomplete for banner eligibility (dev). */
  ignoreMagicFillCompleted: boolean;
  toggleIgnoreMagicFillCompleted: () => void;
}

export const useMagicFillDevStore = create<MagicFillDevStore>((set) => ({
  forceOnboardingBanner: false,
  toggleForceOnboardingBanner: () =>
    set((s) => ({ forceOnboardingBanner: !s.forceOnboardingBanner })),
  forceOnboardingVariant: "first_moment",
  setForceOnboardingVariant: (forceOnboardingVariant) =>
    set({ forceOnboardingVariant }),
  ignoreMagicFillCompleted: false,
  toggleIgnoreMagicFillCompleted: () =>
    set((s) => ({ ignoreMagicFillCompleted: !s.ignoreMagicFillCompleted })),
}));
