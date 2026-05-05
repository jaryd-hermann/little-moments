/**
 * "On this day" push — surfaces a user's own moment from exactly 30,
 * 90, 180, or 365 days ago, fired at their preferred local time + 1h
 * (so the daytime nudge doesn't compete with this).
 *
 * Why this exists:
 *   This is the long-term retention engine for journaling apps. Day One,
 *   Timehop, Facebook all built billion-user moats on this single
 *   mechanic. The push should NEVER feel like marketing; it's the user's
 *   own words being handed back to them.
 *
 * Eligibility per user:
 *   1. notification_enabled = true
 *   2. account_age_days >= 30 (otherwise no ≥30d-old moments exist)
 *   3. Currently in the firing window (notification_time + 1h, ±20min)
 *      in the user's local timezone.
 *   4. At least one moment whose *memory date* falls on today's date
 *      minus 30/90/180/365 days in their timezone: primary photo
 *      taken_at when present, else journal entry_date (exact moments
 *      only). Longest bucket wins: 365 > 180 > 90 > 30.
 *
 * Idempotency: one dispatch per user per local calendar day, keyed by
 * `on_this_day:<YYYY-MM-DD>` in lifecycle_dispatches.
 *
 * Frequency cap: built-in. The 4-bucket-only design ensures users hit
 * this push roughly 4× per year per anniversary, not daily.
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

const ANNIVERSARIES = [365, 180, 90, 30] as const; // longest-first for picking
const WINDOW_MINUTES = 20;

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_timezone: string | null;
  notification_time: string | null;
  total_moments: number | null;
  created_at: string;
};

type EntryRow = {
  id: string;
  title: string | null;
  body: string;
  ai_enhanced_body: string | null;
  entry_date: string;
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

function preview(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 100) return cleaned;
  return cleaned.slice(0, 97).trimEnd() + "...";
}

function bucketLabel(days: number): string {
  if (days === 365) return "1 year ago today";
  if (days === 180) return "6 months ago today";
  if (days === 90) return "3 months ago today";
  return "1 month ago today";
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-on-this-day" });
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

    // Pull every notification-enabled user with at least one capture and
    // an account at least 30 days old. The window check + per-user
    // anniversary lookup happens below.
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString();
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, notification_timezone, notification_time, total_moments, created_at",
      )
      .eq("notification_enabled", true)
      .gt("total_moments", 0)
      .lte("created_at", thirtyDaysAgoIso);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    let sent = 0;

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
      const targetHour = (promptT.hour + 1) % 24;
      if (!inWindow(local.hour, local.minute, targetHour, promptT.minute)) {
        continue;
      }

      const todayLocal = local.toISODate()!;

      // Pick the longest-back anniversary that has a moment to surface
      // — 365 > 180 > 90 > 30. Anniversaries map to the local "today's
      // date" minus N days, also computed in the user's local zone so
      // DST shifts don't cause off-by-ones.
      let chosen: { days: number; entry: EntryRow } | null = null;
      for (const days of ANNIVERSARIES) {
        const anniversaryDate = local.minus({ days }).toISODate();
        if (!anniversaryDate) continue;
        const { data: rows, error: matchErr } = await supabase.rpc(
          "on_this_day_match_entry",
          {
            p_user_id: p.id,
            p_target_date: anniversaryDate,
            p_tz: tz,
          },
        );
        if (matchErr) {
          console.error(
            "on_this_day_match_entry",
            p.id,
            anniversaryDate,
            matchErr.message,
          );
          break;
        }
        const row = rows?.[0];
        if (row) {
          chosen = { days, entry: row as EntryRow };
          break;
        }
      }

      if (!chosen) continue;

      const text = (chosen.entry.ai_enhanced_body ?? chosen.entry.body ?? "")
        .trim();
      if (!text) continue;

      const result = await dispatch(supabase, {
        userId: p.id,
        eventKey: `on_this_day:${todayLocal}`,
        channel: "push",
        oneShot: true,
        payload: {
          entry_id: chosen.entry.id,
          anniversary_days: chosen.days,
        },
        push: {
          title: bucketLabel(chosen.days),
          body: chosen.entry.title?.trim() || preview(text),
          data: { type: "on_this_day", entry_id: chosen.entry.id },
        },
      });

      if (result.sent) sent++;
    }

    logger.info("cron_on_this_day.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      sent,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({ ok: true, sent }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-on-this-day error:", message);
    logger.error("cron_on_this_day.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
