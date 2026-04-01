/**
 * Scheduled push: 6pm local daily reminder, 9pm streak-at-risk (streak > 5, no moment today).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * - Set CRON_SECRET in Dashboard → Project Settings → Edge Functions → Secrets.
 * - Same value must exist in Vault as secret name cron_evening_pushes_secret (see migration 0006).
 *
 * Scheduling: migration 0006_cron_evening_pushes_schedule.sql uses pg_cron + pg_net to POST here
 * every 15 minutes. Disable JWT verification for this function in the Dashboard.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";

const ANDROID_CHANNEL = "default";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  streak_at_risk_enabled: boolean;
  streak_count: number;
  last_daily_push_local_date: string | null;
  last_streak_risk_push_local_date: string | null;
  notification_timezone: string | null;
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

    const { data: tokens, error: tokErr } = await supabase
      .from("push_tokens")
      .select("expo_push_token, platform, user_id");

    if (tokErr) {
      return new Response(JSON.stringify({ error: tokErr.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const list = tokens ?? [];
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, daily: 0, streak: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const userIds = [...new Set(list.map((t) => t.user_id))];

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, streak_at_risk_enabled, streak_count, last_daily_push_local_date, last_streak_risk_push_local_date, notification_timezone"
      )
      .in("id", userIds);

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const profileById = new Map(
      (profiles as ProfileRow[]).map((p) => [p.id, p])
    );

    const momentTodayCache = new Map<string, boolean>();

    async function hasMomentToday(
      userId: string,
      todayStr: string
    ): Promise<boolean> {
      const key = `${userId}:${todayStr}`;
      if (momentTodayCache.has(key)) {
        return momentTodayCache.get(key)!;
      }
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

    const dailyTickets: Parameters<typeof sendExpoPushTickets>[0] = [];
    const streakTickets: Parameters<typeof sendExpoPushTickets>[0] = [];
    const dailyUserUpdates = new Map<string, string>();
    const streakUserUpdates = new Map<string, string>();

    for (const row of list) {
      const p = profileById.get(row.user_id);
      if (!p || !p.notification_enabled) continue;

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

      const inDailyWindow = hour === 18 && minute < 20;
      const inStreakWindow = hour === 21 && minute < 20;

      if (inDailyWindow && p.last_daily_push_local_date !== todayStr) {
        dailyTickets.push({
          to: row.expo_push_token,
          title: "Little Moments",
          body: "Share a little moment from your day.",
          sound: "default",
          priority: "high",
          channelId: ANDROID_CHANNEL,
        });
        dailyUserUpdates.set(row.user_id, todayStr);
      }

      if (
        inStreakWindow &&
        p.streak_at_risk_enabled &&
        p.streak_count > 5 &&
        p.last_streak_risk_push_local_date !== todayStr
      ) {
        if (!(await hasMomentToday(row.user_id, todayStr))) {
          streakTickets.push({
            to: row.expo_push_token,
            title: "Streak at risk",
            body: `You have a ${p.streak_count}-day streak — add today's moment before the day ends.`,
            sound: "default",
            priority: "high",
            channelId: ANDROID_CHANNEL,
          });
          streakUserUpdates.set(row.user_id, todayStr);
        }
      }
    }

    await sendExpoPushTickets(dailyTickets);
    await sendExpoPushTickets(streakTickets);

    for (const [id, date] of dailyUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_daily_push_local_date: date })
        .eq("id", id);
    }

    for (const [id, date] of streakUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_streak_risk_push_local_date: date })
        .eq("id", id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        daily: dailyTickets.length,
        streak: streakTickets.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
