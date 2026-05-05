import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccentColor } from "@/constants/Colors";

export type ThemePreference = "light" | "dark" | "system";

interface SettingsStore {
  /**
   * User-selected appearance preference. "system" means follow the device's
   * current colour scheme (resolved at the call site via `useTheme`). The
   * default is "system" so a fresh install picks up the OS look until the
   * user explicitly chooses a side.
   */
  theme: ThemePreference;
  accentColor: AccentColor;
  notificationEnabled: boolean;
  notificationTime: { hour: number; minute: number };
  streakAtRiskEnabled: boolean;
  storyProgress: Record<string, number>;
  graphIntroSeen: boolean;
  setTheme: (theme: ThemePreference) => void;
  setAccentColor: (color: AccentColor) => void;
  setNotificationEnabled: (val: boolean) => void;
  setNotificationTime: (hour: number, minute: number) => void;
  setStreakAtRiskEnabled: (val: boolean) => void;
  setStoryProgress: (storyIndex: string | number, slideReached: number) => void;
  setGraphIntroSeen: (val: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: "system",
      accentColor: "pink",
      notificationEnabled: true,
      notificationTime: { hour: 6, minute: 0 },
      streakAtRiskEnabled: true,
      storyProgress: {},
      graphIntroSeen: false,
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
      setGraphIntroSeen: (graphIntroSeen) => set({ graphIntroSeen }),
    }),
    {
      name: "little-moments-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
