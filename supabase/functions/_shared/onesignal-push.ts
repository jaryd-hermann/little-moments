/**
 * Send a push via the OneSignal REST API targeting users by Supabase user_id
 * (which is set as the OneSignal `external_id` via `OneSignal.login(userId)`
 * in the client at sign-in).
 *
 * Why OneSignal (vs. Expo Push) for these notifications:
 *   - Rich-media support (`big_picture` on Android, `ios_attachments` on iOS)
 *     works out-of-the-box because the OneSignal Notification Service Extension
 *     is already shipped via `onesignal-expo-plugin` in app.config.ts.
 *   - We dedupe per user by `external_id` instead of per-device push token.
 *
 * Required Supabase secrets:
 *   - ONESIGNAL_APP_ID         (same UUID as EXPO_PUBLIC_ONESIGNAL_APP_ID)
 *   - ONESIGNAL_REST_API_KEY   (Settings → Keys & IDs → REST API Key in OneSignal dashboard)
 */

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

export interface OneSignalPushOpts {
  /** Supabase user ids to target (one OneSignal `external_id` per user). */
  externalIds: string[];
  title: string;
  body: string;
  /**
   * Optional image URL. Must be a public HTTPS URL — the iOS NSE downloads it
   * at delivery time, and FCM fetches it for Android `bigPicture` rendering.
   */
  imageUrl?: string;
  /**
   * Optional custom payload — surfaced to the client via
   * `OneSignal.Notifications.addClickListener`'s `event.notification.additionalData`.
   * Use it for routing intent (e.g. `{ type: "weekly_chapter_intro" }`).
   * Values must be JSON-serializable; OneSignal forwards the entire object
   * verbatim.
   */
  data?: Record<string, unknown>;
}

/**
 * OneSignal REST API caps `include_aliases.external_id` at 2,000 entries per
 * request. We chunk to stay well under that.
 */
const ALIAS_BATCH = 1000;

export async function sendOneSignalPush(opts: OneSignalPushOpts): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error(
      "Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY env var"
    );
  }
  const ids = [...new Set(opts.externalIds)].filter(Boolean);
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += ALIAS_BATCH) {
    const chunk = ids.slice(i, i + ALIAS_BATCH);
    const payload: Record<string, unknown> = {
      app_id: ONESIGNAL_APP_ID,
      target_channel: "push",
      include_aliases: { external_id: chunk },
      headings: { en: opts.title },
      contents: { en: opts.body },
    };
    if (opts.imageUrl) {
      payload.big_picture = opts.imageUrl;
      // The key here is the attachment id; OneSignal forwards it into the APNs
      // payload's `att` dict, which the OneSignal NSE consumes.
      payload.ios_attachments = { image: opts.imageUrl };
      payload.mutable_content = true;
    }
    if (opts.data && Object.keys(opts.data).length > 0) {
      // OneSignal exposes this object on the client as
      // `event.notification.additionalData` inside addClickListener.
      payload.data = opts.data;
    }

    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OneSignal HTTP ${res.status}: ${text}`);
    }
    // OneSignal returns { id, recipients, errors? } on 200. Surface non-fatal
    // delivery errors (e.g. invalid_aliases) without aborting the whole cron.
    const json = (await res.json()) as {
      id?: string;
      recipients?: number;
      errors?: unknown;
    };
    if (json.errors) {
      console.warn("OneSignal partial errors:", JSON.stringify(json.errors));
    }
  }
}
