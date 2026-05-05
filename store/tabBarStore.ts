import { create } from "zustand";

interface TabBarStore {
  hidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
  addResetTrigger: number;
  triggerAddReset: () => void;
  /** Bumped after a moment is saved so the Capsule tab icon can spin + glimmer to celebrate. */
  capsulePulseTrigger: number;
  pulseCapsule: () => void;
}

export const useTabBarStore = create<TabBarStore>((set) => ({
  hidden: false,
  setTabBarHidden: (hidden) => set({ hidden }),
  addResetTrigger: 0,
  triggerAddReset: () => set((s) => ({ addResetTrigger: s.addResetTrigger + 1 })),
  capsulePulseTrigger: 0,
  pulseCapsule: () => set((s) => ({ capsulePulseTrigger: s.capsulePulseTrigger + 1 })),
}));
