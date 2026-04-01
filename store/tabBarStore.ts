import { create } from "zustand";

interface TabBarStore {
  hidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
}

export const useTabBarStore = create<TabBarStore>((set) => ({
  hidden: false,
  setTabBarHidden: (hidden) => set({ hidden }),
}));
