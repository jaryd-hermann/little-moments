import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const ANDROID_DEFAULT_CHANNEL_ID = "default";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let androidChannelReady = false;

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_DEFAULT_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#f0d7ff",
  });
  androidChannelReady = true;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  await ensureAndroidNotificationChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleDailyReminder(
  hour: number,
  minute: number
): Promise<void> {
  await ensureAndroidNotificationChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Your daily prompt is ready",
      body: "Capture your moment — it takes less than 2 minutes.",
      sound: true,
      ...(Platform.OS === "android"
        ? { channelId: ANDROID_DEFAULT_CHANNEL_ID }
        : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
