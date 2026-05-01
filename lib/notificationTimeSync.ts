import { useSettingsStore } from "@/store/settingsStore";

export type ReminderSlot = "morning" | "afternoon" | "evening";

export const REMINDER_SLOT_DEFAULTS: Record<
  ReminderSlot,
  { hour: number; minute: number }
> = {
  morning: { hour: 6, minute: 0 },
  afternoon: { hour: 14, minute: 30 },
  evening: { hour: 21, minute: 0 },
};

/** Parse Postgres `time` / `HH:MM:SS` string from profiles.notification_time */
export function parseNotificationTimeFromDb(
  value: string | null | undefined
): { hour: number; minute: number } {
  if (!value || typeof value !== "string") {
    return { ...REMINDER_SLOT_DEFAULTS.morning };
  }
  const parts = value.trim().split(":");
  const h = parseInt(parts[0] ?? "6", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) {
    return { ...REMINDER_SLOT_DEFAULTS.morning };
  }
  return {
    hour: Math.min(23, Math.max(0, h)),
    minute: Math.min(59, Math.max(0, m)),
  };
}

export function formatNotificationTimeForDb(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

/** Which preset best matches this time (for UI default selection). */
export function inferReminderSlotFromTime(
  hour: number,
  minute: number
): ReminderSlot {
  const t = hour * 60 + minute;
  const dist = (a: ReminderSlot) => {
    const d = REMINDER_SLOT_DEFAULTS[a];
    return Math.abs(t - (d.hour * 60 + d.minute));
  };
  if (dist("morning") <= dist("afternoon") && dist("morning") <= dist("evening")) {
    return "morning";
  }
  if (dist("afternoon") <= dist("evening")) return "afternoon";
  return "evening";
}

export function applyNotificationTimeFromProfile(
  notificationTime: string | null | undefined
): void {
  const { hour, minute } = parseNotificationTimeFromDb(notificationTime);
  useSettingsStore.getState().setNotificationTime(hour, minute);
}
