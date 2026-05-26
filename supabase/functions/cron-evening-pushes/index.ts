/**
 * Scheduled pushes (runs every 15 min via pg_cron):
 *
 * 1. Daily nudge — fires inside a 20-min window around the user's chosen
 *    `notification_time` (interpreted in `notification_timezone`). Sent with
 *    the `push-mock.png` rich-media image. Copy reflects
 *    `reflection_target_default` (yesterday vs today). Skipped (with the same
 *    `last_morning_push_local_date` stamp as a send) when the user already
 *    has an exact-date moment for *today* in their timezone.
 * 2. Follow-up — `notification_time + 3h`, only if the user hasn't captured a
 *    moment today. Text-only.
 * 3. Midday photo nudge — 12:30 local; copy nudges snapping a pic; app opens
 *    the camera. Skipped when user already captured today. One per local day
 *    (`last_midday_photo_nudge_local_date`).
 * 4. Bedtime activation rescue (D0 only) — at 22:00 local on the signup day,
 *    if the user still hasn't captured anything. One-shot per user, ever.
 *
 * Delivery: OneSignal REST API via the shared `dispatch()` helper, which
 * targets users by `external_id` (= Supabase user id) and logs each send
 * to `lifecycle_dispatches` for analytics + idempotency.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env (Supabase secrets):
 *   - CRON_SECRET
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 *   - PUSH_MOCK_URL  (public URL of the daily-nudge hero image)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { dispatchBulkPush } from "../_shared/dispatch.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  last_morning_push_local_date: string | null;
  last_followup_push_local_date: string | null;
  last_midday_photo_nudge_local_date: string | null;
  notification_timezone: string | null;
  /** Local time (HH:MM:SS) for the daily nudge, interpreted in notification_timezone. */
  notification_time: string | null;
  reflection_target_default: string | null;
  total_moments: number | null;
  created_at: string;
};

function parseLocalPromptTime(
  notificationTime: string | null | undefined,
): { hour: number; minute: number } {
  if (!notificationTime || typeof notificationTime !== "string") {
    return { hour: 6, minute: 0 };
  }
  const parts = notificationTime.trim().split(":");
  const h = parseInt(parts[0] ?? "6", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return { hour: 6, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, h)),
    minute: Math.min(59, Math.max(0, m)),
  };
}

function inTimeWindow(
  localHour: number,
  localMinute: number,
  targetHour: number,
  targetMinute: number,
  windowMinutes = 20,
): boolean {
  const now = localHour * 60 + localMinute;
  const start = targetHour * 60 + targetMinute;
  return now >= start && now < start + windowMinutes;
}

// Daily prompt copy reflects whether the user typically captures “yesterday” or
// “today” — matches profiles.reflection_target_default from onboarding.
function dailyNudgeCopy(reflectionTarget: string | null): {
  title: string;
  body: string;
} {
  if (reflectionTarget === "yesterday") {
    return {
      title: "Your moment for yesterday",
      body:
        "Pick a photo from that day or answer a quick question — under two minutes.",
    };
  }
  return {
    title: "Your moment for today",
    body:
      "Pick a photo from today or answer a quick question — under two minutes.",
  };
}

const FOLLOWUP_COPY = {
  title: "Still time today",
  body: "Your moment is waiting — open Capture to finish in under a minute.",
};

// D0 last-chance copy. Tone is intentionally softer than the daytime
// follow-up because the user hasn't tried at all yet — we want to
// invite, not nag.
const BEDTIME_RESCUE_COPY = {
  title: "60 seconds, before today disappears",
  body:
    "One moment — talk it out, type a line. The first one is always the hardest.",
};

const MIDDAY_PHOTO_NUDGE_COPY = {
  title: "Light reminder",
  body: "Snap a pic of something today for your next moment.",
};

// 12:30 local — light-weight daytime nudge; pairs with in-app camera deep link.
const MIDDAY_HOUR = 12;
const MIDDAY_MINUTE = 30;

// 22:00 local — late enough to be a "before bed" nudge, early enough to
// not wake anyone up. Only fires if the user hasn't captured today AND
// their account is <24h old.
const BEDTIME_HOUR = 22;
const BEDTIME_MINUTE = 0;

Deno.serve(async (req) => {
  // One wide-event logger per invocation (see posthog-logs.ts).
  const logger = createPostHogLogger({ service: "cron-evening-pushes" });
  const startedAt = Date.now();
  try {
    const secret = Deno.env.get("CRON_SECRET");
    const auth = req.headers.get("Authorization");
    if (!secret || auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const pushMockUrl = Deno.env.get("PUSH_MOCK_URL");
    if (!pushMockUrl) {
      console.warn(
        "PUSH_MOCK_URL is unset — daily nudges will send without image",
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // We target users (not devices) — OneSignal dedupes by external_id and
    // delivers to all push subscriptions associated with that user.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, last_morning_push_local_date, last_followup_push_local_date, last_midday_photo_nudge_local_date, notification_timezone, notification_time, reflection_target_default, total_moments, created_at",
      )
      .eq("notification_enabled", true);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Single bucket per push variant — each variant fans out in one
    // OneSignal request and gets logged via dispatchBulkPush.
    const dailyNudgeRecipients: string[] = [];
    const followupRecipients: string[] = [];
    const bedtimeRescueRecipients: string[] = [];
    const middayPhotoNudgeRecipients: string[] = [];
    const dailyNudgeUserUpdates = new Map<string, string>();
    const followupUserUpdates = new Map<string, string>();
    const middayPhotoNudgeUserUpdates = new Map<string, string>();

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

    // Already-fired check for bedtime rescue: query lifecycle_dispatches
    // once for the candidate set rather than per-user. We pull all
    // existing rows for this event_key and use the set as a skip list.
    const candidateBedtimeIds = (profiles as ProfileRow[])
      .filter((p) => (p.total_moments ?? 0) === 0)
      .map((p) => p.id);
    const bedtimeAlreadyFired = new Set<string>();
    if (candidateBedtimeIds.length > 0) {
      const { data: existing } = await supabase
        .from("lifecycle_dispatches")
        .select("user_id")
        .eq("event_key", "bedtime_rescue")
        .in("user_id", candidateBedtimeIds);
      for (const r of existing ?? []) bedtimeAlreadyFired.add(r.user_id);
    }

    for (const p of profiles as ProfileRow[]) {
      const tz = p.notification_timezone || "America/New_York";
      let local: DateTime;
      try {
        local = DateTime.now().setZone(tz);
      } catch {
        continue;
      }
      if (!local.isValid) continue;

      const todayStr = local.toISODate()!;
      const hour = local.hour;
      const minute = local.minute;

      const promptT = parseLocalPromptTime(p.notification_time);
      // Follow-up is anchored to the chosen nudge time + 3h, wrapped past midnight.
      const followupHour = (promptT.hour + 3) % 24;
      const inDailyNudgeWindow = inTimeWindow(
        hour,
        minute,
        promptT.hour,
        promptT.minute,
      );
      const inFollowupWindow = inTimeWindow(
        hour,
        minute,
        followupHour,
        promptT.minute,
      );
      const inBedtimeWindow = inTimeWindow(
        hour,
        minute,
        BEDTIME_HOUR,
        BEDTIME_MINUTE,
      );
      const inMiddayWindow = inTimeWindow(
        hour,
        minute,
        MIDDAY_HOUR,
        MIDDAY_MINUTE,
      );

      // --- Daily nudge: at user's chosen time ---
      if (inDailyNudgeWindow && p.last_morning_push_local_date !== todayStr) {
        if (await hasMomentToday(p.id, todayStr)) {
          // Already answered the daily prompt today (e.g. captured at 6am,
          // nudge at 7am) — no push, but stamp so we don't keep re-checking
          // every cron tick in the 20-min window.
          dailyNudgeUserUpdates.set(p.id, todayStr);
        } else {
          dailyNudgeRecipients.push(p.id);
          dailyNudgeUserUpdates.set(p.id, todayStr);
        }
      }

      // --- Follow-up: +3h, only if no moment yet today ---
      if (
        inFollowupWindow &&
        p.last_followup_push_local_date !== todayStr &&
        !inDailyNudgeWindow // defensive: don't double-fire if windows overlap
      ) {
        if (!(await hasMomentToday(p.id, todayStr))) {
          followupRecipients.push(p.id);
          followupUserUpdates.set(p.id, todayStr);
        }
      }

      // --- Midday camera nudge: 12:30 local, once per day ---
      if (
        inMiddayWindow &&
        p.last_midday_photo_nudge_local_date !== todayStr &&
        !inDailyNudgeWindow &&
        !inFollowupWindow &&
        !inBedtimeWindow
      ) {
        if (!(await hasMomentToday(p.id, todayStr))) {
          middayPhotoNudgeRecipients.push(p.id);
          middayPhotoNudgeUserUpdates.set(p.id, todayStr);
        }
      }

      // --- Bedtime rescue: D0 only, 22:00 local, never captured ---
      // Gates:
      //   1. Account < 24h old (the "D0" definition).
      //   2. total_moments = 0.
      //   3. We're inside the 22:00 local window.
      //   4. Lifecycle dispatch hasn't already fired (one-shot ever).
      const accountAgeMs = Date.now() - Date.parse(p.created_at);
      const isD0 = accountAgeMs >= 0 && accountAgeMs < 24 * 60 * 60 * 1000;
      if (
        isD0 &&
        (p.total_moments ?? 0) === 0 &&
        inBedtimeWindow &&
        !bedtimeAlreadyFired.has(p.id) &&
        !inDailyNudgeWindow &&
        !inFollowupWindow
      ) {
        if (!(await hasMomentToday(p.id, todayStr))) {
          bedtimeRescueRecipients.push(p.id);
        }
      }
    }

    // Dispatch each bucket. The bulk helper logs to lifecycle_dispatches
    // so we get analytics on top of OneSignal's own.
    const profileById = new Map((profiles as ProfileRow[]).map((p) => [p.id, p]));

    if (dailyNudgeRecipients.length > 0) {
      const dailyYesterday: string[] = [];
      const dailyTodayBucket: string[] = [];
      for (const uid of dailyNudgeRecipients) {
        const pr = profileById.get(uid);
        if (pr?.reflection_target_default === "yesterday") {
          dailyYesterday.push(uid);
        } else {
          dailyTodayBucket.push(uid);
        }
      }
      if (dailyYesterday.length > 0) {
        const copy = dailyNudgeCopy("yesterday");
        await dispatchBulkPush(supabase, {
          userIds: dailyYesterday,
          eventKey: "daily_nudge_yesterday",
          push: {
            title: copy.title,
            body: copy.body,
            imageUrl: pushMockUrl,
            data: { type: "daily_nudge" },
          },
        });
      }
      if (dailyTodayBucket.length > 0) {
        const copy = dailyNudgeCopy("today");
        await dispatchBulkPush(supabase, {
          userIds: dailyTodayBucket,
          eventKey: "daily_nudge_today",
          push: {
            title: copy.title,
            body: copy.body,
            imageUrl: pushMockUrl,
            data: { type: "daily_nudge" },
          },
        });
      }
    }

    if (followupRecipients.length > 0) {
      await dispatchBulkPush(supabase, {
        userIds: followupRecipients,
        eventKey: "daily_nudge_followup",
        push: {
          title: FOLLOWUP_COPY.title,
          body: FOLLOWUP_COPY.body,
          data: { type: "daily_nudge" },
        },
      });
    }

    if (bedtimeRescueRecipients.length > 0) {
      await dispatchBulkPush(supabase, {
        userIds: bedtimeRescueRecipients,
        eventKey: "bedtime_rescue",
        isOneShot: true,
        push: {
          title: BEDTIME_RESCUE_COPY.title,
          body: BEDTIME_RESCUE_COPY.body,
          data: { type: "daily_nudge" },
        },
      });
    }

    if (middayPhotoNudgeRecipients.length > 0) {
      await dispatchBulkPush(supabase, {
        userIds: middayPhotoNudgeRecipients,
        eventKey: "midday_photo_nudge",
        push: {
          title: MIDDAY_PHOTO_NUDGE_COPY.title,
          body: MIDDAY_PHOTO_NUDGE_COPY.body,
          data: { type: "midday_camera_nudge" },
        },
      });
    }

    for (const [id, date] of middayPhotoNudgeUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_midday_photo_nudge_local_date: date })
        .eq("id", id);
    }

    for (const [id, date] of dailyNudgeUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_morning_push_local_date: date })
        .eq("id", id);
    }

    for (const [id, date] of followupUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_followup_push_local_date: date })
        .eq("id", id);
    }

    logger.info("cron_evening_pushes.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      daily_nudge_sent: dailyNudgeRecipients.length,
      followup_sent: followupRecipients.length,
      bedtime_rescue_sent: bedtimeRescueRecipients.length,
      midday_photo_nudge_sent: middayPhotoNudgeRecipients.length,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({
        ok: true,
        dailyNudge: dailyNudgeRecipients.length,
        followup: followupRecipients.length,
        bedtimeRescue: bedtimeRescueRecipients.length,
        middayPhotoNudge: middayPhotoNudgeRecipients.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-evening-pushes error:", message);
    logger.error("cron_evening_pushes.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
