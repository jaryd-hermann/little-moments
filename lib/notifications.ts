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

export type LocalReminderReflectionTarget = "yesterday" | "today";

function dailyReminderCopy(target: LocalReminderReflectionTarget): {
  title: string;
  body: string;
} {
  if (target === "yesterday") {
    return {
      title: "Your moment for yesterday",
      body: "Pick a photo from that day or answer a quick question — under two minutes.",
    };
  }
  return {
    title: "Your moment for today",
    body: "Pick a photo from today or answer a quick question — under two minutes.",
  };
}

const MIDDAY_PHOTO_NUDGE = {
  title: "Light reminder",
  body: "Snap a pic of something today for your next moment.",
} as const;

/**
 * Local-only scheduled reminders when the user has no Expo push token.
 * Schedules the main daily nudge plus a fixed midday “open camera” nudge.
 */
export async function scheduleLocalNotificationReminders(opts: {
  hour: number;
  minute: number;
  reflectionTarget: LocalReminderReflectionTarget;
}): Promise<void> {
  await ensureAndroidNotificationChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  const { title, body } = dailyReminderCopy(opts.reflectionTarget);
  const android = Platform.OS === "android"
    ? { channelId: ANDROID_DEFAULT_CHANNEL_ID }
    : {};

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      data: { type: "daily_nudge" },
      ...android,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: opts.hour,
      minute: opts.minute,
    },
  });

  await Notifications.scheduleNotificationAsync({
    content: {
      title: MIDDAY_PHOTO_NUDGE.title,
      body: MIDDAY_PHOTO_NUDGE.body,
      sound: true,
      data: { type: "midday_camera_nudge" },
      ...android,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 12,
      minute: 30,
    },
  });
}

/** @deprecated Use scheduleLocalNotificationReminders */
export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  reflectionTarget: LocalReminderReflectionTarget = "today",
): Promise<void> {
  await scheduleLocalNotificationReminders({
    hour,
    minute,
    reflectionTarget,
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

/**
 * Schedule the welcome push for ~2 minutes after onboarding finishes
 * (after the OS permission is granted, i.e. once we have a token).
 *
 * - If the user already captured during onboarding (`hasCapturedToday`),
 *   the body congratulates them and nudges a second moment.
 * - Otherwise it nudges them to capture their first moment.
 *
 * Decision is baked in at schedule time (we know capture state from the
 * profile flags right then), so the alert that fires 2 min later will
 * match the truth at the moment of scheduling. Small edge case: a user
 * who captures DURING those 2 min sees the "first moment" copy — fine
 * for v1, and rare in practice (they'd have to leave the paywall, hit
 * Today, capture, all inside two minutes).
 *
 * Called once per onboarding completion. Safe to call without a granted
 * permission — it no-ops.
 */
const WELCOME_DELAY_SECONDS = 120;

export async function scheduleWelcomeFirstCaptureNotification(opts: {
  hasCapturedToday: boolean;
}): Promise<void> {
  await ensureAndroidNotificationChannel();
  const granted = await getNotificationPermissionGranted();
  if (!granted) return;

  const content: Notifications.NotificationContentInput = {
    title: "Welcome to Little Moments!",
    body: opts.hasCapturedToday
      ? "You've captured your first moment already — try one more."
      : "Let's capture your first moment, quickly.",
    sound: true,
    data: {
      type: "welcome_first_capture",
      has_captured_today: opts.hasCapturedToday,
    },
    ...(Platform.OS === "android"
      ? { channelId: ANDROID_DEFAULT_CHANNEL_ID }
      : {}),
  };

  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: WELCOME_DELAY_SECONDS,
      repeats: false,
    },
  });
}

/** @deprecated use scheduleWelcomeFirstCaptureNotification instead. Kept as a
 *  thin wrapper so any older callers (e.g. in-flight branches) still compile,
 *  but they'll now also get the 2-minute delay + capture-aware copy. */
export async function fireWelcomeFirstCaptureNotification(): Promise<void> {
  await scheduleWelcomeFirstCaptureNotification({ hasCapturedToday: false });
}
