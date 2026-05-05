/**
 * Weekly chapter intro push: fires Mondays at 12:00 local time
 * (lunch-time window) for every user with notifications enabled.
 *
 * Copy:
 *   title: "New week. New chapter"
 *   body:  "Add 4 moments this week and we'll create you a personalized weekly chapter"
 *
 * Tap target: routes the user to the Capture page (/(tabs)/today?capture=1)
 * via the OneSignal click listener wired in app/_layout.tsx — keyed by the
 * `data: { type: "weekly_chapter_intro" }` payload sent from here.
 *
 * Idempotency: stamps profiles.last_weekly_chapter_intro_local_date with the
 * local Monday so the same user can't be re-pushed if the cron tick happens
 * twice inside the firing window (DST shifts, retries, etc.).
 *
 * Schedule: pg_cron runs this every 15 min; window logic lives here.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env (Supabase secrets):
 *   - CRON_SECRET
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { dispatchBulkPush } from "../_shared/dispatch.ts";

const FALLBACK_TZ = "UTC";
const TARGET_WEEKDAY = 1; // Monday in luxon (1=Mon..7=Sun)
const TARGET_HOUR = 12; // local lunch-time
const WINDOW_MINUTES = 20; // matches the 15-min cron tick + buffer

const PUSH_TITLE = "New week. New chapter";
const PUSH_BODY =
  "Add 4 moments this week and we'll create you a personalized weekly chapter";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  last_weekly_chapter_intro_local_date: string | null;
};

Deno.serve(async (req) => {
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, notification_timezone, last_weekly_chapter_intro_local_date"
      )
      .eq("notification_enabled", true);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Collect all eligible recipients up front, then fan out to OneSignal in
    // a single REST call (the API supports up to 2,000 external_ids per
    // request and the helper batches further if needed).
    const recipients: string[] = [];
    const stampUpdates = new Map<string, string>();

    for (const p of profiles as ProfileRow[]) {
      const tz = p.notification_timezone || FALLBACK_TZ;
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;

      // Fire on Monday at the target hour, before the 20-min window closes.
      if (
        local.weekday !== TARGET_WEEKDAY ||
        local.hour !== TARGET_HOUR ||
        local.minute >= WINDOW_MINUTES
      ) {
        continue;
      }

      const todayStr = local.toISODate()!;
      if (p.last_weekly_chapter_intro_local_date === todayStr) continue;

      recipients.push(p.id);
      stampUpdates.set(p.id, todayStr);
    }

    if (recipients.length > 0) {
      await dispatchBulkPush(supabase, {
        userIds: recipients,
        eventKey: "weekly_chapter_intro",
        push: {
          title: PUSH_TITLE,
          body: PUSH_BODY,
          data: { type: "weekly_chapter_intro" },
        },
      });

      // Stamp the dates after the push succeeds so a transient OneSignal
      // failure leaves the user eligible on the next 15-min tick rather
      // than silently skipped for the week.
      for (const [id, date] of stampUpdates) {
        await supabase
          .from("profiles")
          .update({ last_weekly_chapter_intro_local_date: date })
          .eq("id", id);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: recipients.length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-weekly-chapter-intro error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
