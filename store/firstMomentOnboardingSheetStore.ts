import { create } from "zustand";

/**
 * Slide-up sheet after the first capture in the post-notifications onboarding path.
 * In-memory only — `FirstMomentOnboardingSheetHost` in the tab layout keeps it visible
 * across navigation.
 */
interface FirstMomentOnboardingSheetStore {
  visible: boolean;
  entryId: string | null;
  show: (entryId: string) => void;
  dismiss: () => void;
}

export const useFirstMomentOnboardingSheetStore =
  create<FirstMomentOnboardingSheetStore>((set) => ({
    visible: false,
    entryId: null,
    show: (entryId) => set({ visible: true, entryId }),
    dismiss: () => set({ visible: false, entryId: null }),
  }));
