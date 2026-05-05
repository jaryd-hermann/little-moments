/**
 * Server-side OneSignal tag sync.
 *
 * Used by `cron-onesignal-sync` (and any future server triggers that
 * need to keep OneSignal tags fresh for users who haven't opened the
 * app recently). Client-side tag sync still happens in
 * `lib/onesignal.native.ts` for low-latency updates while the user is
 * active — server sync covers the gap when the user is dormant.
 *
 * OneSignal API reference (User Model, v11):
 *   PATCH https://api.onesignal.com/apps/{APP_ID}/users/by/external_id/{external_id}
 *   body: { "properties": { "tags": { "key": "value" } } }
 *
 * Tags are upserted (PATCH semantics) — keys not in the request are
 * left alone. To clear a tag, send the empty string.
 *
 * Required Supabase secrets:
 *   - ONESIGNAL_APP_ID
 *   - ONESIGNAL_REST_API_KEY
 */

const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID");
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY");

export interface UserTags {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Update tags for a single user (by Supabase user_id, which equals
 * the OneSignal external_id).
 *
 * Coerces values to strings — OneSignal stores all tag values as
 * strings on the wire. `null` / `undefined` become "" which the API
 * treats as a delete.
 */
export async function updateOneSignalTags(
  userId: string,
  tags: UserTags,
): Promise<void> {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    throw new Error(
      "Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY env var",
    );
  }
  if (!userId) return;

  const stringTags: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v === undefined) continue;
    stringTags[k] = v === null ? "" : String(v);
  }
  if (Object.keys(stringTags).length === 0) return;

  const url =
    `https://api.onesignal.com/apps/${ONESIGNAL_APP_ID}/users/by/external_id/${userId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Key ${ONESIGNAL_REST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ properties: { tags: stringTags } }),
  });

  if (!res.ok) {
    const text = await res.text();
    // 404 = user not in OneSignal yet (hasn't opened the app post-signup).
    // We swallow it — there's nothing to tag, and the next client sync
    // (when they next open the app) will create the player record.
    if (res.status === 404) return;
    console.warn(
      `OneSignal tag PATCH failed for user ${userId} (HTTP ${res.status}): ${text}`,
    );
  }
}

/**
 * Bulk variant — drives sequential PATCHes with a small concurrency
 * window so we don't hammer the OneSignal API. Errors per user are
 * swallowed and logged; the cron should keep going.
 */
export async function updateOneSignalTagsBatch(
  updates: Array<{ userId: string; tags: UserTags }>,
  concurrency = 5,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < updates.length) {
      const next = updates[i++];
      if (!next) break;
      try {
        await updateOneSignalTags(next.userId, next.tags);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`OneSignal tag sync error for ${next.userId}:`, message);
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, updates.length) }, worker),
  );
}
