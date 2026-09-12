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
  /** Master toggle for streak UI + streak-related pushes. Synced to profiles.streak_at_risk_enabled. */
  streaksEnabled: boolean;
  storyProgress: Record<string, number>;
  graphIntroSeen: boolean;
  /**
   * When enabled, iOS Live Photos loop their paired video inline wherever
   * the photo renders (entry detail, flipbook, carousels). When off, all
   * photos render as static stills. Default on — Live Photo is the more
   * lively, 1-second-a-day-style experience the user opted into.
   */
  livePhotoPlaybackEnabled: boolean;
  /** True after the user finishes at least one Dig Deeper session. */
  hasCompletedDigDeeper: boolean;
  /** True after the user dismisses the Magic Fill first-run explainer. */
  hasSeenMagicFillIntro: boolean;
  /** True after the user completes at least one Magic Fill batch save. */
  hasCompletedMagicFill: boolean;
  magicFillBannerDismissedCapsule: boolean;
  magicFillBannerDismissedCapture: boolean;
  magicFillPreferredCaptionMode: "text" | "voice" | null;
  setTheme: (theme: ThemePreference) => void;
  setAccentColor: (color: AccentColor) => void;
  setNotificationEnabled: (val: boolean) => void;
  setNotificationTime: (hour: number, minute: number) => void;
  setStreaksEnabled: (val: boolean) => void;
  setStoryProgress: (storyIndex: string | number, slideReached: number) => void;
  setGraphIntroSeen: (val: boolean) => void;
  setLivePhotoPlaybackEnabled: (val: boolean) => void;
  setHasCompletedDigDeeper: (val: boolean) => void;
  setHasSeenMagicFillIntro: (val: boolean) => void;
  setHasCompletedMagicFill: (val: boolean) => void;
  setMagicFillBannerDismissedCapsule: (val: boolean) => void;
  setMagicFillBannerDismissedCapture: (val: boolean) => void;
  setMagicFillPreferredCaptionMode: (mode: "text" | "voice" | null) => void;
  /**
   * Reset per-account onboarding / feature-completion flags so a new user on
   * the same device starts clean. Device-level *preferences* (theme, accent,
   * notification time, live-photo playback) are intentionally preserved.
   */
  resetUserScopedFlags: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: "system",
      accentColor: "pink",
      notificationEnabled: true,
      notificationTime: { hour: 6, minute: 0 },
      streaksEnabled: true,
      storyProgress: {},
      graphIntroSeen: false,
      livePhotoPlaybackEnabled: true,
      hasCompletedDigDeeper: false,
      hasSeenMagicFillIntro: false,
      hasCompletedMagicFill: false,
      magicFillBannerDismissedCapsule: false,
      magicFillBannerDismissedCapture: false,
      magicFillPreferredCaptionMode: null,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setNotificationEnabled: (notificationEnabled) =>
        set({ notificationEnabled }),
      setNotificationTime: (hour, minute) =>
        set({ notificationTime: { hour, minute } }),
      setStreaksEnabled: (streaksEnabled) => set({ streaksEnabled }),
      setStoryProgress: (storyIndex, slideReached) => {
        const prev = get().storyProgress;
        const current = prev[storyIndex] ?? 0;
        if (slideReached > current) {
          set({ storyProgress: { ...prev, [storyIndex]: slideReached } });
        }
      },
      setGraphIntroSeen: (graphIntroSeen) => set({ graphIntroSeen }),
      setLivePhotoPlaybackEnabled: (livePhotoPlaybackEnabled) =>
        set({ livePhotoPlaybackEnabled }),
      setHasCompletedDigDeeper: (hasCompletedDigDeeper) =>
        set({ hasCompletedDigDeeper }),
      setHasSeenMagicFillIntro: (hasSeenMagicFillIntro) =>
        set({ hasSeenMagicFillIntro }),
      setHasCompletedMagicFill: (hasCompletedMagicFill) =>
        set({ hasCompletedMagicFill }),
      setMagicFillBannerDismissedCapsule: (magicFillBannerDismissedCapsule) =>
        set({ magicFillBannerDismissedCapsule }),
      setMagicFillBannerDismissedCapture: (magicFillBannerDismissedCapture) =>
        set({ magicFillBannerDismissedCapture }),
      setMagicFillPreferredCaptionMode: (magicFillPreferredCaptionMode) =>
        set({ magicFillPreferredCaptionMode }),
      resetUserScopedFlags: () =>
        set({
          storyProgress: {},
          graphIntroSeen: false,
          hasCompletedDigDeeper: false,
          hasSeenMagicFillIntro: false,
          hasCompletedMagicFill: false,
          magicFillBannerDismissedCapsule: false,
          magicFillBannerDismissedCapture: false,
          magicFillPreferredCaptionMode: null,
        }),
    }),
    {
      name: "little-moments-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persisted, version) => {
        const state = persisted as Record<string, unknown> | undefined;
        if (!state) return persisted as SettingsStore;
        if (version === 0 && state.streaksEnabled === undefined) {
          state.streaksEnabled = state.streakAtRiskEnabled ?? true;
        }
        return state as SettingsStore;
      },
    }
  )
);
