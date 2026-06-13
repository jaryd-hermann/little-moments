import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Drives the one-shot "You saved your first core memory" celebration sheet.
 *
 * `hasSeenFirstPinCelebration` is the only persisted bit — it ensures the
 * celebration fires exactly once per user. `visible` is in-memory because the
 * sheet should always come up dismissed on cold start, even if the user
 * backgrounded the app mid-celebration.
 *
 * The dev "Pin" tester calls `show()` directly to preview the UI without
 * needing a real first-pin event; it doesn't check the persisted flag.
 */
interface FirstPinCelebrationStore {
  visible: boolean;
  hasSeenFirstPinCelebration: boolean;
  show: () => void;
  dismiss: () => void;
  /** Mark seen without showing — useful when we don't want to retroactively
   *  fire the celebration for users who already have pins from before this
   *  feature shipped. */
  markSeen: () => void;
  /** Dev-only reset so the celebration can be re-triggered from settings. */
  resetSeen: () => void;
}

export const useFirstPinCelebrationStore = create<FirstPinCelebrationStore>()(
  persist(
    (set) => ({
      visible: false,
      hasSeenFirstPinCelebration: false,
      show: () => set({ visible: true }),
      dismiss: () =>
        set({ visible: false, hasSeenFirstPinCelebration: true }),
      markSeen: () => set({ hasSeenFirstPinCelebration: true }),
      resetSeen: () => set({ hasSeenFirstPinCelebration: false }),
    }),
    {
      name: "little-moments-first-pin-celebration",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        hasSeenFirstPinCelebration: s.hasSeenFirstPinCelebration,
      }),
    }
  )
);
