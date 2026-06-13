import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface SecondMomentPaywallStore {
  hasShown: boolean;
  markShown: () => void;
}

export const useSecondMomentPaywallStore = create<SecondMomentPaywallStore>()(
  persist(
    (set) => ({
      hasShown: false,
      markShown: () => set({ hasShown: true }),
    }),
    {
      name: "little-moments-second-moment-paywall",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
