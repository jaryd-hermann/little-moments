import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface MomentPaywallStore {
  /** Moment count at which the auto paywall was last shown (0 = never). */
  lastShownAtCount: number;
  markShownAtCount: (count: number) => void;
}

/**
 * Auto-paywall cadence for non-subscribers: show after the 2nd moment, then
 * every 3rd moment thereafter (5th, 8th, 11th, ...). `lastShownAtCount` guards
 * against re-firing for the same milestone across remounts.
 */
export function shouldAutoShowPaywallAtCount(count: number): boolean {
  if (count < 2) return false;
  return (count - 2) % 3 === 0;
}

export const useSecondMomentPaywallStore = create<MomentPaywallStore>()(
  persist(
    (set) => ({
      lastShownAtCount: 0,
      markShownAtCount: (count) => set({ lastShownAtCount: count }),
    }),
    {
      name: "little-moments-second-moment-paywall",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
