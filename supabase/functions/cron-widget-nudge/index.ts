/**
 * Home screen widget promo — one push, once ever, during the onboarding week.
 *
 * Audience: 11:00 local on account day 4, for users who have captured at
 * least one moment. Day 4 rather than day 1 so the widget lands as a
 * shortcut to something they already do, not as setup homework.
 *
 * Gates:
 *   - notification_enabled
 *   - total_moments >= 1
 *   - iOS only — the widget target is iOS-only today (see `targets/widget/`).
 *     Android would be told to add something that doesn't exist.
 *   - signed up on or after `WIDGET_BUILD_LIVE_FROM`, so nobody on a binary
 *     without the widget target gets told to go find it
 *   - `lifecycle_dispatches` has no row for the event key (one-shot, ever)
 *
 * 11:00 is deliberately clear of every capture nudge in
 * `cron-evening-pushes` (notification_time, +3h follow-up, 12:30 midday,
 * 19:30 streak risk, 22:00 rescue), so this can't eat a capture prompt.
 *
 * Tap payload: { type: "widget_nudge" } → routed in `app/_layout.tsx`.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { dispatch } from "../_shared/dispatch.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

/**
 * Local date (YYYY-MM-DD) the widget build went live in the App Store.
 *
 * Null on purpose: until it's set, this cron is a no-op. A user whose app
 * predates the widget target has nothing to add, and telling them otherwise
 * is a support ticket. Set this to the release date when the build ships.
 */
const WIDGET_BUILD_LIVE_FROM: string | null = null;

/** Account day the promo fires on. Day 0 is signup day. */
const NUDGE_ACCOUNT_DAY = 4;

const NUDGE_HOUR = 11;
const NUDGE_MINUTE = 0;
const WINDOW_MINUTES = 20;

/** Widest signup age we ever need to consider, with slack for tz spread. */
const LOOKBACK_DAYS = NUDGE_ACCOUNT_DAY + 3;

const EVENT_KEY = "widget_nudge_onboarding";

const COPY = {
  title: "Did you know we have a home widget?",
  body: "Add it for quick capturing.",
} as const;

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  total_moments: number | null;
  created_at: string;
};

function inWindow(local: DateTime): boolean {
  const now = local.hour * 60 + local.minute;
  const start = NUDGE_HOUR * 60 + NUDGE_MINUTE;
  return now >= start && now < start + WINDOW_MINUTES;
}

function accountAgeDays(row: ProfileRow, local: DateTime): number {
  const created = DateTime.fromISO(row.created_at)
    .setZone(local.zoneName)
    .startOf("day");
  return Math.floor(local.startOf("day").diff(created, "days").days);
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-widget-nudge" });
  const startedAt = Date.now();
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (!WIDGET_BUILD_LIVE_FROM) {
      logger.info("cron_widget_nudge.disabled", {
        reason: "WIDGET_BUILD_LIVE_FROM unset",
      });
      await logger.flush();
      return new Response(
        JSON.stringify({ ok: true, sent: 0, disabled: true }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lookbackFloor = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const releaseFloor = new Date(`${WIDGET_BUILD_LIVE_FROM}T00:00:00Z`)
      .toISOString();
    // Whichever floor is tighter — right after release that's the release
    // date, and from then on it's the rolling lookback.
    const signupFloor =
      releaseFloor > lookbackFloor ? releaseFloor : lookbackFloor;

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, notification_timezone, total_moments, created_at",
      )
      .eq("notification_enabled", true)
      .gte("total_moments", 1)
      .gte("created_at", signupFloor);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Narrow to the ones actually inside their local window before touching
    // push_tokens, so the platform lookup stays small.
    const eligible: ProfileRow[] = [];
    for (const row of profiles as ProfileRow[]) {
      const tz = row.notification_timezone || "America/New_York";
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;
      if (!inWindow(local)) continue;
      if (accountAgeDays(row, local) !== NUDGE_ACCOUNT_DAY) continue;
      eligible.push(row);
    }

    let iosUserIds = new Set<string>();
    if (eligible.length > 0) {
      const { data: tokens } = await supabase
        .from("push_tokens")
        .select("user_id")
        .eq("platform", "ios")
        .in("user_id", eligible.map((r) => r.id));
      iosUserIds = new Set((tokens ?? []).map((t) => t.user_id as string));
    }

    let sent = 0;
    let skippedAndroid = 0;

    for (const row of eligible) {
      if (!iosUserIds.has(row.id)) {
        skippedAndroid += 1;
        continue;
      }

      const result = await dispatch(supabase, {
        userId: row.id,
        eventKey: EVENT_KEY,
        channel: "push",
        oneShot: true,
        push: {
          title: COPY.title,
          body: COPY.body,
          data: { type: "widget_nudge" },
        },
        payload: { account_days: NUDGE_ACCOUNT_DAY },
      });
      if (result.sent) sent += 1;
    }

    logger.info("cron_widget_nudge.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      eligible: eligible.length,
      sent,
      skipped_non_ios: skippedAndroid,
    });
    await logger.flush();

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-widget-nudge error:", message);
    logger.error("cron_widget_nudge.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
