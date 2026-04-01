import { create } from "zustand";

interface MomentCelebrationStore {
  visible: boolean;
  momentNumber: number | null;
  show: (momentNumber: number) => void;
  dismiss: () => void;
}

export const useMomentCelebrationStore = create<MomentCelebrationStore>(
  (set) => ({
    visible: false,
    momentNumber: null,
    show: (momentNumber) =>
      set({ visible: true, momentNumber }),
    dismiss: () => set({ visible: false, momentNumber: null }),
  })
);
