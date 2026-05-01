import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "@/lib/supabase";
import {
  ensureAndroidNotificationChannel,
  scheduleDailyReminder,
  cancelAllNotifications,
} from "@/lib/notifications";
import { formatNotificationTimeForDb } from "@/lib/notificationTimeSync";

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
    await supabase
      .from("profiles")
      .update({
        notification_time: formatNotificationTimeForDb(
          options.reminderHour,
          options.reminderMinute
        ),
      })
      .eq("id", session.user.id);
  }

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
      await scheduleDailyReminder(
        options.reminderHour,
        options.reminderMinute
      );
    }
  } else {
    await scheduleDailyReminder(
      options.reminderHour,
      options.reminderMinute
    );
  }
}
