import { create } from "zustand";

interface TabBarStore {
  hidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
  addResetTrigger: number;
  triggerAddReset: () => void;
}

export const useTabBarStore = create<TabBarStore>((set) => ({
  hidden: false,
  setTabBarHidden: (hidden) => set({ hidden }),
  addResetTrigger: 0,
  triggerAddReset: () => set((s) => ({ addResetTrigger: s.addResetTrigger + 1 })),
}));
