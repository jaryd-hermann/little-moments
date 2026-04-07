import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "lm_today_notification_nudge_dismissed_ids";

async function readIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

export async function isTodayNotificationNudgeDismissed(
  userId: string
): Promise<boolean> {
  const ids = await readIds();
  return ids.has(userId);
}

export async function dismissTodayNotificationNudge(
  userId: string
): Promise<void> {
  const ids = await readIds();
  ids.add(userId);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}
