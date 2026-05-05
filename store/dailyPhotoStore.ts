import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PickedPhoto } from "@/hooks/useMediaLibrary";

/**
 * Persists the "photo of the day" so it doesn't change every time the user
 * cold-starts the app or re-focuses the Capture tab. The same photo sticks
 * for the entire local calendar day until the user shuffles or a new day
 * generates a new prompt.
 *
 * Keyed per (user, calendar-day) so signed-out -> signed-in transitions
 * and timezone changes can't surface another user's pick.
 */

export interface StoredDailyPhoto {
  /** Local "yyyy-MM-dd" the pick was made on. */
  dateKey: string;
  /** PickedPhoto serialized; primitives only, safe for AsyncStorage. */
  photo: PickedPhoto;
}

interface DailyPhotoState {
  /** Key is `${userId}:${dateKey}`. Empty userId means anonymous/local. */
  byUserDay: Record<string, StoredDailyPhoto>;
  setDailyPhoto: (userId: string, dateKey: string, photo: PickedPhoto) => void;
  getDailyPhoto: (userId: string, dateKey: string) => PickedPhoto | null;
  clearDailyPhoto: (userId: string, dateKey: string) => void;
}

const keyFor = (userId: string, dateKey: string) =>
  `${userId || "anon"}:${dateKey}`;

export const useDailyPhotoStore = create<DailyPhotoState>()(
  persist(
    (set, get) => ({
      byUserDay: {},
      setDailyPhoto: (userId, dateKey, photo) =>
        set({
          byUserDay: {
            ...get().byUserDay,
            [keyFor(userId, dateKey)]: { dateKey, photo },
          },
        }),
      getDailyPhoto: (userId, dateKey) => {
        const stored = get().byUserDay[keyFor(userId, dateKey)];
        if (!stored || stored.dateKey !== dateKey) return null;
        return stored.photo;
      },
      clearDailyPhoto: (userId, dateKey) => {
        const k = keyFor(userId, dateKey);
        const { [k]: _, ...rest } = get().byUserDay;
        set({ byUserDay: rest });
      },
    }),
    {
      name: "little-moments-daily-photo",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
