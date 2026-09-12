import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Inactivity (in days since the last captured moment) that triggers the prompt. */
export const CATCH_UP_IDLE_DAYS = 7;
/** Don't re-prompt within this many days, however long the lapse runs. */
const CATCH_UP_COOLDOWN_DAYS = 7;

interface CatchUpPromptStore {
  /** Whether the full-screen catch-up modal is on screen right now. */
  visible: boolean;
  /** ISO timestamp of the last time we showed it, or null if never. */
  lastShownAt: string | null;
  /**
   * Show the modal if the user has lapsed and we haven't nudged recently.
   * Returns true when it actually opened.
   */
  maybeShow: (daysSinceLastCapture: number) => boolean;
  dismiss: () => void;
}

export const useCatchUpPromptStore = create<CatchUpPromptStore>()(
  persist(
    (set, get) => ({
      visible: false,
      lastShownAt: null,
      maybeShow: (daysSinceLastCapture) => {
        if (daysSinceLastCapture <= CATCH_UP_IDLE_DAYS) return false;
        if (get().visible) return false;
        const last = get().lastShownAt;
        if (last) {
          const elapsedDays =
            (Date.now() - new Date(last).getTime()) / 86_400_000;
          // A long lapse shouldn't mean a full-screen takeover on every open.
          if (elapsedDays < CATCH_UP_COOLDOWN_DAYS) return false;
        }
        set({ visible: true, lastShownAt: new Date().toISOString() });
        return true;
      },
      dismiss: () => set({ visible: false }),
    }),
    {
      name: "little-moments-catch-up-prompt",
      storage: createJSONStorage(() => AsyncStorage),
      // `visible` is per-session; only the cooldown needs to survive restarts.
      partialize: (s) => ({ lastShownAt: s.lastShownAt }),
    }
  )
);
