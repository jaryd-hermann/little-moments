import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { Entry } from "@/store/entryStore";
import {
  countClipsInMashupBucket,
  mashupBucketKeyForEntryDate,
  type MashupBucketType,
} from "@/lib/mashupBuckets";
import {
  ensureAndroidNotificationChannel,
  getNotificationPermissionGranted,
} from "@/lib/notifications";
import { useSettingsStore } from "@/store/settingsStore";

/** ~90 min — avoids colliding with the 2-min welcome nudge or instant save toast. */
const MASHUP_DELAY_SECONDS = 90 * 60;
/** Stagger when week + month + year all start on the same capture. */
const MASHUP_STAGGER_SECONDS = 10 * 60;

const ANDROID_DEFAULT_CHANNEL_ID = "default";

function mashupPeriodLabel(type: MashupBucketType): string {
  switch (type) {
    case "week":
      return "weekly";
    case "month":
      return "monthly";
    case "year":
      return "yearly";
  }
}

function notifKey(type: MashupBucketType, bucketKey: string): string {
  return `${type}:${bucketKey}`;
}

function parseEntryDate(ymd: string): Date | null {
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * When the user's save adds the first clip to a week / month / year montage
 * bucket, schedule a delayed local push so it doesn't land on top of the
 * immediate "moment saved" notification or the 2-minute welcome nudge.
 */
export async function scheduleMashupStartedNotificationsIfNeeded(opts: {
  entryDateYmd: string;
  momentsBeforeSave: Entry[];
}): Promise<void> {
  const entryDate = parseEntryDate(opts.entryDateYmd);
  if (!entryDate) return;

  await ensureAndroidNotificationChannel();
  const granted = await getNotificationPermissionGranted();
  if (!granted) return;

  const store = useSettingsStore.getState();
  const types: MashupBucketType[] = ["week", "month", "year"];
  const newlyStarted: { type: MashupBucketType; key: string }[] = [];

  for (const type of types) {
    const key = mashupBucketKeyForEntryDate(type, entryDate);
    const id = notifKey(type, key);
    if (store.notifiedMashupKeys.includes(id)) continue;
    const countBefore = countClipsInMashupBucket(
      opts.momentsBeforeSave,
      type,
      key
    );
    if (countBefore === 0) {
      newlyStarted.push({ type, key });
    }
  }

  if (newlyStarted.length === 0) return;

  const android =
    Platform.OS === "android" ? { channelId: ANDROID_DEFAULT_CHANNEL_ID } : {};

  for (let i = 0; i < newlyStarted.length; i++) {
    const { type, key } = newlyStarted[i];
    const id = notifKey(type, key);
    const period = mashupPeriodLabel(type);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Your new ${period} moment montage has started`,
        body: "Tap here to see it and we'll keep putting your moments together here.",
        sound: true,
        data: {
          type: "mashup_started",
          mashup_type: type,
          mashup_key: key,
        },
        ...android,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: MASHUP_DELAY_SECONDS + i * MASHUP_STAGGER_SECONDS,
        repeats: false,
      },
    });

    store.markMashupNotified(id);
  }
}
