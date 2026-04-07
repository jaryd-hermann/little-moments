import { create } from "zustand";

interface TodayNotifDevStore {
  dummyNotificationNudgeEnabled: boolean;
  toggleDummyNotificationNudge: () => void;
}

export const useTodayNotifDevStore = create<TodayNotifDevStore>((set) => ({
  dummyNotificationNudgeEnabled: false,
  toggleDummyNotificationNudge: () =>
    set((s) => ({
      dummyNotificationNudgeEnabled: !s.dummyNotificationNudgeEnabled,
    })),
}));
