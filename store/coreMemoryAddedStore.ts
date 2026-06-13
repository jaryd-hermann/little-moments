import { create } from "zustand";

interface CoreMemoryAddedStore {
  visible: boolean;
  /** 1-based count shown in the toaster headline. */
  coreCount: number;
  show: (coreCount: number) => void;
  dismiss: () => void;
}

export const useCoreMemoryAddedStore = create<CoreMemoryAddedStore>((set) => ({
  visible: false,
  coreCount: 0,
  show: (coreCount) => set({ visible: true, coreCount }),
  dismiss: () => set({ visible: false }),
}));
