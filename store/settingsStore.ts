import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccentColor } from "@/constants/Colors";

interface SettingsStore {
  theme: "light" | "dark";
  accentColor: AccentColor;
  notificationEnabled: boolean;
  notificationTime: { hour: number; minute: number };
  streakAtRiskEnabled: boolean;
  storyProgress: Record<string, number>;
  setTheme: (theme: "light" | "dark") => void;
  setAccentColor: (color: AccentColor) => void;
  setNotificationEnabled: (val: boolean) => void;
  setNotificationTime: (hour: number, minute: number) => void;
  setStreakAtRiskEnabled: (val: boolean) => void;
  setStoryProgress: (storyIndex: string | number, slideReached: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: "dark",
      accentColor: "pink",
      notificationEnabled: true,
      notificationTime: { hour: 20, minute: 0 },
      streakAtRiskEnabled: true,
      storyProgress: {},
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setNotificationEnabled: (notificationEnabled) =>
        set({ notificationEnabled }),
      setNotificationTime: (hour, minute) =>
        set({ notificationTime: { hour, minute } }),
      setStreakAtRiskEnabled: (streakAtRiskEnabled) =>
        set({ streakAtRiskEnabled }),
      setStoryProgress: (storyIndex, slideReached) => {
        const prev = get().storyProgress;
        const current = prev[storyIndex] ?? 0;
        if (slideReached > current) {
          set({ storyProgress: { ...prev, [storyIndex]: slideReached } });
        }
      },
    }),
    {
      name: "little-moments-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
