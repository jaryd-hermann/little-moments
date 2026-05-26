import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import {
  ensureAndroidNotificationChannel,
  scheduleLocalNotificationReminders,
  cancelAllNotifications,
} from "@/lib/notifications";
import { formatNotificationTimeForDb } from "@/lib/notificationTimeSync";
import type { LocalReminderReflectionTarget } from "@/lib/notifications";

function normalizeReflectionTarget(
  v: LocalReminderReflectionTarget | null | undefined
): LocalReminderReflectionTarget {
  return v === "yesterday" || v === "today" ? v : "today";
}

function getExpoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;
  return extra?.eas?.projectId;
}

async function tryGetExpoPushToken(): Promise<string | null> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return null;
  const projectId = getExpoProjectId();
  if (!projectId) return null;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Registers Expo push token + IANA timezone with Supabase (for server pushes).
 * When a token exists, cancels local daily reminders to avoid duplicate 6pm alerts.
 * Without a token (simulator / denied), schedules a local daily reminder instead.
 */
export async function syncPushRegistration(options: {
  notificationsEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  reflectionTargetDefault?: LocalReminderReflectionTarget | null;
  /** When set, written to `profiles.capture_rhythm`. */
  captureRhythm?: "morning" | "evening" | null;
}): Promise<void> {
  await ensureAndroidNotificationChannel();

  if (!options.notificationsEnabled) {
    await cancelAllNotifications();
    return;
  }

  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? undefined;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) {
    const row: Record<string, string> = {
      notification_time: formatNotificationTimeForDb(
        options.reminderHour,
        options.reminderMinute
      ),
    };
    if (
      options.reflectionTargetDefault !== undefined &&
      options.reflectionTargetDefault !== null
    ) {
      row.reflection_target_default = normalizeReflectionTarget(
        options.reflectionTargetDefault
      );
    }
    if (options.captureRhythm === "morning" || options.captureRhythm === "evening") {
      row.capture_rhythm = options.captureRhythm;
    }
    await supabase.from("profiles").update(row).eq("id", session.user.id);
  }

  const reflectionTarget = normalizeReflectionTarget(
    options.reflectionTargetDefault
  );

  const token = await tryGetExpoPushToken();

  if (token) {
    await cancelAllNotifications();
    if (!session) return;

    const { error } = await supabase.functions.invoke("register-push-token", {
      body: {
        expoPushToken: token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        timezone,
      },
    });
    if (error) {
      await scheduleLocalNotificationReminders({
        reminderHour: options.reminderHour,
        reminderMinute: options.reminderMinute,
        reflectionTarget,
      });
    }
  } else {
    await scheduleLocalNotificationReminders({
      reminderHour: options.reminderHour,
      reminderMinute: options.reminderMinute,
      reflectionTarget,
    });
  }
}
