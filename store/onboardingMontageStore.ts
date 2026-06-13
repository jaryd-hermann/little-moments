import { create } from "zustand";
import type { MediaAsset } from "@/hooks/useMediaLibrary";

interface OnboardingMontageStore {
  assets: MediaAsset[];
  setAssets: (assets: MediaAsset[]) => void;
  clear: () => void;
}

export const useOnboardingMontageStore = create<OnboardingMontageStore>(
  (set) => ({
    assets: [],
    setAssets: (assets) => set({ assets }),
    clear: () => set({ assets: [] }),
  })
);
