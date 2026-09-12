/**
 * "Log this day from your past" push — nudges the user to capture a moment
 * from an earlier year of this same calendar day, using photos that are
 * already sitting in their camera roll.
 *
 * How this differs from `cron-on-this-day`:
 *   - `cron-on-this-day` hands back a moment the user ALREADY captured, and
 *     deep-links to it in the Capsule flipbook.
 *   - This push points at photos they have NOT captured yet, and deep-links
 *     to the "this day in your past" carousel on Capture.
 *
 * Why the content check happens on the device:
 *   Whether a past-year photo exists for today is camera-roll state, which
 *   only the client can see — there is no server-side signal for it. So this
 *   cron targets on the signals we do have (notifications on, onboarding
 *   finished, cadence) and the carousel renders its own empty state on the
 *   rare miss. Keeping the cadence to once a week is what stops that miss
 *   from being annoying.
 *
 * Eligibility per user:
 *   1. notification_enabled = true
 *   2. onboarding_completed = true (don't interrupt onboarding)
 *   3. Currently in the firing window (notification_time + 2h, ±20min) in
 *      the user's local timezone — +0h is the daily nudge and +1h is
 *      `cron-on-this-day`, so this sits clear of both.
 *
 * Cadence: at most one per user per 7 days, enforced by `dispatch`'s
 * `freqCap` on the `this_day_past` key prefix. The dated `oneShot` key
 * additionally stops repeat sends inside a single local day.
 *
 * Cron: every 15 min via pg_cron (window logic inside the function).
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
import { dispatch } from "../_shared/dispatch.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

const WINDOW_MINUTES = 20;
/** Hours after the user's prompt time — clear of the nudge (+0) and on-this-day (+1). */
const OFFSET_HOURS = 2;
/** Max one of these per user per week. */
const CADENCE_DAYS = 7;

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  notification_time: string | null;
  onboarding_completed: boolean;
};

function parseHHMM(t: string | null): { hour: number; minute: number } {
  if (!t) return { hour: 6, minute: 0 };
  const [hStr, mStr] = t.trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(hStr ?? "6", 10) || 6));
  const m = Math.min(59, Math.max(0, parseInt(mStr ?? "0", 10) || 0));
  return { hour: h, minute: m };
}

function inWindow(
  hour: number,
  minute: number,
  targetHour: number,
  targetMinute: number,
): boolean {
  const now = hour * 60 + minute;
  const start = targetHour * 60 + targetMinute;
  return now >= start && now < start + WINDOW_MINUTES;
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-this-day-past" });
  const startedAt = Date.now();
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, notification_timezone, notification_time, onboarding_completed",
      )
      .eq("notification_enabled", true)
      .eq("onboarding_completed", true);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let sent = 0;
    let skippedCadence = 0;

    for (const p of profiles as ProfileRow[]) {
      const tz = p.notification_timezone || "UTC";
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;

      const promptT = parseHHMM(p.notification_time);
      const targetHour = (promptT.hour + OFFSET_HOURS) % 24;
      if (!inWindow(local.hour, local.minute, targetHour, promptT.minute)) {
        continue;
      }

      const todayLocal = local.toISODate()!;

      const result = await dispatch(supabase, {
        userId: p.id,
        eventKey: `this_day_past:${todayLocal}`,
        channel: "push",
        oneShot: true,
        freqCap: { keyPrefix: "this_day_past", windowDays: CADENCE_DAYS },
        payload: { local_date: todayLocal },
        push: {
          title: "Log this day from your past!",
          body:
            "You might have photos from this day in an earlier year — turn one into a little moment.",
          data: { type: "this_day_past" },
        },
      });

      if (result.sent) sent++;
      else if (result.reason === "freq_cap") skippedCadence++;
    }

    logger.info("cron_this_day_past.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      sent,
      skipped_cadence: skippedCadence,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({ ok: true, sent, skipped_cadence: skippedCadence }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-this-day-past error:", message);
    logger.error("cron_this_day_past.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
