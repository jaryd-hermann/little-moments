/**
 * Magic Fill promotional pushes — nudge users who haven't tried backfill yet.
 *
 * Audiences (one send per user per eligible window; max 3 lifetime):
 *
 * A) Lapsed capturers — 6:30 pm local on day 3, 5, or 7 without a moment
 *    captured (consecutive days since last_entry_date, or since signup).
 * B) Engaged capturers — 7:00 pm local on account day 10, 20, or 30 with
 *    total_moments >= 2.
 *
 * Global gates:
 *   - notification_enabled
 *   - has_completed_magic_fill = false
 *   - magic_fill_started_at is null (never opened wizard)
 *   - account age >= 48 hours
 *   - magic_fill_nudge_count < 3
 *   - last_magic_fill_nudge_at null or >= 7 days ago
 *   - lifecycle_dispatches has no row for this tier's event_key (one-shot)
 *
 * Tap payload: { type: "magic_fill_nudge", audience: "lapsed"|"engaged" }
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { dispatch } from "../_shared/dispatch.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

const MIN_ACCOUNT_AGE_MS = 48 * 60 * 60 * 1000;
const NUDGE_COOLDOWN_DAYS = 7;
const MAX_LIFETIME_NUDGES = 3;
const WINDOW_MINUTES = 20;

const LAPSED_HOUR = 18;
const LAPSED_MINUTE = 30;
const ENGAGED_HOUR = 19;
const ENGAGED_MINUTE = 0;

const LAPSED_DAYS = [3, 5, 7] as const;
const ENGAGED_ACCOUNT_DAYS = [10, 20, 30] as const;

const LAPSED_COPY = {
  title: "Photos waiting to become moments",
  body:
    "Photos from the last few days are waiting — Magic Fill can turn them into moments in minutes.",
} as const;

const ENGAGED_COPY = [
  {
    title: "Backfill a few days at once",
    body:
      "You've been capturing — want to backfill a few older days at once? Try Magic Fill.",
  },
  {
    title: "Days waiting in your camera roll",
    body:
      "Your camera roll has days waiting. Magic Fill finds them and helps you caption fast.",
  },
  {
    title: "Catch up on past moments",
    body:
      "Magic Fill scans recent days with photos and helps you save several moments quickly.",
  },
] as const;

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  total_moments: number | null;
  last_entry_date: string | null;
  created_at: string;
  has_completed_magic_fill: boolean;
  magic_fill_started_at: string | null;
  last_magic_fill_nudge_at: string | null;
  magic_fill_nudge_count: number | null;
};

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

function daysBetween(start: DateTime, end: DateTime): number {
  return Math.floor(
    end.startOf("day").diff(start.startOf("day"), "days").days,
  );
}

function daysSinceLastCapture(p: ProfileRow, local: DateTime): number {
  const tz = local.zoneName;
  if (p.last_entry_date) {
    const last = DateTime.fromISO(p.last_entry_date, { zone: tz }).startOf(
      "day",
    );
    if (last.isValid) return daysBetween(last, local);
  }
  const created = DateTime.fromISO(p.created_at).setZone(tz).startOf("day");
  return daysBetween(created, local);
}

function accountAgeDays(p: ProfileRow, local: DateTime): number {
  const created = DateTime.fromISO(p.created_at)
    .setZone(local.zoneName)
    .startOf("day");
  return daysBetween(created, local);
}

function nudgeCooldownOk(p: ProfileRow, local: DateTime): boolean {
  if (!p.last_magic_fill_nudge_at) return true;
  const last = DateTime.fromISO(p.last_magic_fill_nudge_at);
  if (!last.isValid) return true;
  return local.diff(last, "days").days >= NUDGE_COOLDOWN_DAYS;
}

function passesGlobalGates(p: ProfileRow, local: DateTime): boolean {
  const accountAgeMs = Date.now() - Date.parse(p.created_at);
  if (accountAgeMs < MIN_ACCOUNT_AGE_MS) return false;
  if (p.has_completed_magic_fill) return false;
  if (p.magic_fill_started_at) return false;
  if ((p.magic_fill_nudge_count ?? 0) >= MAX_LIFETIME_NUDGES) return false;
  if (!nudgeCooldownOk(p, local)) return false;
  return true;
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-magic-fill-nudges" });
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
        "id, notification_enabled, notification_timezone, total_moments, last_entry_date, created_at, has_completed_magic_fill, magic_fill_started_at, last_magic_fill_nudge_at, magic_fill_nudge_count",
      )
      .eq("notification_enabled", true)
      .eq("has_completed_magic_fill", false)
      .is("magic_fill_started_at", null)
      .lt("magic_fill_nudge_count", MAX_LIFETIME_NUDGES);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const momentTodayCache = new Map<string, boolean>();
    async function hasMomentToday(
      userId: string,
      todayStr: string,
    ): Promise<boolean> {
      const key = `${userId}:${todayStr}`;
      if (momentTodayCache.has(key)) return momentTodayCache.get(key)!;
      const { data } = await supabase
        .from("entries")
        .select("id")
        .eq("user_id", userId)
        .eq("entry_type", "moment")
        .eq("date_precision", "exact")
        .eq("entry_date", todayStr)
        .limit(1)
        .maybeSingle();
      const v = !!data;
      momentTodayCache.set(key, v);
      return v;
    }

    let lapsedSent = 0;
    let engagedSent = 0;

    for (const row of profiles as ProfileRow[]) {
      const tz = row.notification_timezone || "America/New_York";
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;
      if (!passesGlobalGates(row, local)) continue;

      const todayStr = local.toISODate()!;
      const inLapsedWindow = inWindow(
        local.hour,
        local.minute,
        LAPSED_HOUR,
        LAPSED_MINUTE,
      );
      const inEngagedWindow = inWindow(
        local.hour,
        local.minute,
        ENGAGED_HOUR,
        ENGAGED_MINUTE,
      );

      if (inLapsedWindow) {
        const gapDays = daysSinceLastCapture(row, local);
        if (
          LAPSED_DAYS.includes(gapDays as (typeof LAPSED_DAYS)[number]) &&
          !(await hasMomentToday(row.id, todayStr))
        ) {
          const eventKey = `magic_fill_nudge_lapsed_${gapDays}`;
          const result = await dispatch(supabase, {
            userId: row.id,
            eventKey,
            channel: "push",
            oneShot: true,
            push: {
              title: LAPSED_COPY.title,
              body: LAPSED_COPY.body,
              data: { type: "magic_fill_nudge", audience: "lapsed", gap_days: gapDays },
            },
            payload: { gap_days: gapDays },
          });
          if (result.sent) {
            lapsedSent += 1;
            await supabase
              .from("profiles")
              .update({
                last_magic_fill_nudge_at: new Date().toISOString(),
                magic_fill_nudge_count: (row.magic_fill_nudge_count ?? 0) + 1,
              })
              .eq("id", row.id);
            continue;
          }
        }
      }

      if (inEngagedWindow) {
        const acctDays = accountAgeDays(row, local);
        if (
          (row.total_moments ?? 0) >= 2 &&
          ENGAGED_ACCOUNT_DAYS.includes(
            acctDays as (typeof ENGAGED_ACCOUNT_DAYS)[number],
          )
        ) {
          const tierIndex = ENGAGED_ACCOUNT_DAYS.indexOf(
            acctDays as (typeof ENGAGED_ACCOUNT_DAYS)[number],
          );
          const copy = ENGAGED_COPY[tierIndex] ?? ENGAGED_COPY[0];
          const eventKey = `magic_fill_nudge_engaged_${acctDays}`;
          const result = await dispatch(supabase, {
            userId: row.id,
            eventKey,
            channel: "push",
            oneShot: true,
            push: {
              title: copy.title,
              body: copy.body,
              data: {
                type: "magic_fill_nudge",
                audience: "engaged",
                account_days: acctDays,
              },
            },
            payload: { account_days: acctDays },
          });
          if (result.sent) {
            engagedSent += 1;
            await supabase
              .from("profiles")
              .update({
                last_magic_fill_nudge_at: new Date().toISOString(),
                magic_fill_nudge_count: (row.magic_fill_nudge_count ?? 0) + 1,
              })
              .eq("id", row.id);
          }
        }
      }
    }

    logger.info("cron_magic_fill_nudges.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      lapsed_sent: lapsedSent,
      engaged_sent: engagedSent,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({
        ok: true,
        lapsedSent,
        engagedSent,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-magic-fill-nudges error:", message);
    logger.error("cron_magic_fill_nudges.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
