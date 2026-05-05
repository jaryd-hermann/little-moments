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

export async function getNotificationPermissionGranted(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Fire a local notification celebrating the just-saved moment.
 *
 * This is a local push (no server round-trip) so it lands in the device's
 * notification center even when the OS would otherwise suppress an in-app
 * banner. iOS attachments only support local file URIs (and `attachedPhotoUri`
 * is exactly that for freshly captured photos).
 */
export async function fireMomentSavedNotification(opts: {
  totalMoments: number;
  attachedPhotoUri?: string;
}): Promise<void> {
  await ensureAndroidNotificationChannel();
  const granted = await getNotificationPermissionGranted();
  if (!granted) return;

  const isLocalFile =
    typeof opts.attachedPhotoUri === "string" &&
    opts.attachedPhotoUri.startsWith("file:");

  /**
   * Expo's `NotificationContentInput` type doesn't expose iOS `attachments`
   * directly, but the runtime accepts the platform-specific field for the
   * iOS Notification Service Extension. Cast to satisfy TypeScript.
   */
  const content: Notifications.NotificationContentInput = {
    title: `You captured your ${ordinal(opts.totalMoments)} moment`,
    body: "A new memory is in your Capsule.",
    sound: true,
    ...(Platform.OS === "android"
      ? { channelId: ANDROID_DEFAULT_CHANNEL_ID }
      : {}),
  };
  if (isLocalFile && Platform.OS === "ios") {
    (content as Record<string, unknown>).attachments = [
      { url: opts.attachedPhotoUri!, identifier: "captured-photo" },
    ];
  }

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: null,
  });
}
