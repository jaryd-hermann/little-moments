import {
  OneSignal,
  LogLevel,
  type NotificationClickEvent,
} from "react-native-onesignal";

const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim();

let initialized = false;
// Avoid re-issuing addEmail on every auth event in the same session. Cleared on logout.
let lastSyncedEmail: string | null = null;

/**
 * OneSignal for marketing / one-off pushes. Chapter and other flows stay on expo-notifications.
 * Does not call requestPermission — reuse the system prompt from your existing notification UX.
 */
export function initOneSignal(): void {
  if (!appId || initialized) return;
  initialized = true;
  if (__DEV__) {
    OneSignal.Debug.setLogLevel(LogLevel.Verbose);
  }
  OneSignal.initialize(appId);
}

export function syncOneSignalUser(
  userId: string | null,
  email: string | null = null,
): void {
  if (!appId || !initialized) return;
  if (userId) {
    OneSignal.login(userId);
    if (email && email !== lastSyncedEmail) {
      OneSignal.User.addEmail(email);
      lastSyncedEmail = email;
    }
  } else {
    OneSignal.logout();
    lastSyncedEmail = null;
  }
}

/**
 * Tag the current OneSignal user with arbitrary key/value pairs so we can
 * segment / filter audiences from the OneSignal dashboard (e.g. send a "you
 * have N unseen threads, upgrade to unlock more" campaign).
 *
 * OneSignal stores tags as strings; coerce numbers/booleans at the call site.
 * Idempotent — addTags overwrites existing values for the same keys.
 */
export function syncOneSignalThreadTags(
  tags: Record<string, string>,
): void {
  if (!appId || !initialized) return;
  if (Object.keys(tags).length === 0) return;
  OneSignal.User.addTags(tags);
}

/**
 * Sync the current user's lifetime moment activity to OneSignal so dashboard
 * segments can target "activated" vs "not yet captured" cohorts and tier
 * users by lifetime moment count for marketing campaigns.
 *
 * Tag schema:
 *   - `total_moments`        : stringified integer count
 *   - `has_captured_moment`  : "true" once total_moments >= 1, else "false"
 *
 * The two-tag split lets dashboard rules use a fast string equality check
 * for the common activated/not-activated cut without parsing an integer.
 */
export function syncOneSignalMomentTags(totalMoments: number): void {
  if (!appId || !initialized) return;
  const safe = Number.isFinite(totalMoments) ? Math.max(0, totalMoments) : 0;
  OneSignal.User.addTags({
    total_moments: String(safe),
    has_captured_moment: safe >= 1 ? "true" : "false",
  });
}

/**
 * Sync streak / pin / album-progress tags. These mirror the server-side
 * `cron-onesignal-sync` writes — we run both so the dashboard sees fresh
 * values for active users (this hook) AND for dormant users (the cron).
 *
 * Tag schema:
 *   - `current_streak`  : stringified integer
 *   - `total_pinned`    : stringified integer
 *   - `has_pinned`      : "true" / "false" — fast equality check for
 *                         the first-pin push gate.
 */
export function syncOneSignalEngagementTags(opts: {
  currentStreak: number;
  totalPinned: number;
}): void {
  if (!appId || !initialized) return;
  const streak = Number.isFinite(opts.currentStreak)
    ? Math.max(0, opts.currentStreak)
    : 0;
  const pins = Number.isFinite(opts.totalPinned)
    ? Math.max(0, opts.totalPinned)
    : 0;
  OneSignal.User.addTags({
    current_streak: String(streak),
    total_pinned: String(pins),
    has_pinned: pins >= 1 ? "true" : "false",
  });
}

/**
 * Sync timezone + preferred local notification time. Lets you do
 * "send to everyone whose nudge time is morning" segmentation without
 * round-tripping through the Supabase profile.
 *
 * Tag schema:
 *   - `notification_timezone` : IANA tz id (e.g. "America/New_York")
 *   - `notification_time`     : "HH:MM" (24h, no seconds)
 */
export function syncOneSignalScheduleTags(opts: {
  timezone: string | null;
  notificationTime: string | null;
}): void {
  if (!appId || !initialized) return;
  const tags: Record<string, string> = {};
  if (opts.timezone) tags.notification_timezone = opts.timezone;
  if (opts.notificationTime) {
    // Strip seconds if present — we only care about HH:MM for display.
    const trimmed = opts.notificationTime.slice(0, 5);
    tags.notification_time = trimmed;
  }
  if (Object.keys(tags).length === 0) return;
  OneSignal.User.addTags(tags);
}

/**
 * Subscribe to OneSignal notification taps (cold-start and warm-tap both
 * route through the same `click` event in v5). The handler receives the
 * raw `NotificationClickEvent` — read `event.notification.additionalData`
 * for the JSON payload sent as `data` from the REST API.
 *
 * Returns an unsubscribe function so callers can detach inside React
 * `useEffect` cleanup.
 */
export function addOneSignalClickListener(
  handler: (event: NotificationClickEvent) => void,
): () => void {
  if (!appId) return () => {};
  // It's safe to register before `initialize` (the SDK queues listeners),
  // but we still gate on `appId` so a misconfigured build no-ops instead of
  // throwing.
  OneSignal.Notifications.addEventListener("click", handler);
  return () => {
    OneSignal.Notifications.removeEventListener("click", handler);
  };
}
