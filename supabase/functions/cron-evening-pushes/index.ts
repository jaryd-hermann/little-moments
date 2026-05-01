/**
 * Scheduled pushes (runs every 15 min via pg_cron):
 *
 * 1. 7 AM local — morning prompt push, conditional on today's prompt type
 *    (word / photo / question on a 3-day rotation).
 * 2. 6 PM local — gentle reminder, only if the user hasn't answered today's prompt.
 * 3. 9 PM local — streak-at-risk (streak > 5, no moment today).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { DateTime } from "npm:luxon@3.5.0";
import { sendExpoPushTickets } from "../_shared/expo-push.ts";

const ANDROID_CHANNEL = "default";

type PromptType = "word" | "photo" | "question";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  streak_at_risk_enabled: boolean;
  streak_count: number;
  last_morning_push_local_date: string | null;
  last_daily_push_local_date: string | null;
  last_streak_risk_push_local_date: string | null;
  notification_timezone: string | null;
  /** Local time (HH:MM:SS) for the daily new-prompt push, interpreted in notification_timezone */
  notification_time: string | null;
};

function parseLocalPromptTime(
  notificationTime: string | null | undefined
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
  windowMinutes = 20
): boolean {
  const now = localHour * 60 + localMinute;
  const start = targetHour * 60 + targetMinute;
  return now >= start && now < start + windowMinutes;
}

/**
 * Mirrors client-side getDailyPromptType() from lib/dailyPrompt.ts.
 * 3-day rotation: day 0 = word, day 1 = photo, day 2 = question.
 */
function getPromptTypeForDate(local: DateTime): PromptType {
  const dayIndex = local.ordinal - 1;
  const cycle = dayIndex % 3;
  switch (cycle) {
    case 0:
      return "word";
    case 1:
      return "photo";
    case 2:
      return "question";
    default:
      return "word";
  }
}

function getMorningPush(promptType: PromptType): { title: string; body: string } {
  switch (promptType) {
    case "word":
      return {
        title: "Your daily word is ready",
        body: "See today's word and capture your moment — it takes less than 2 minutes.",
      };
    case "photo":
      return {
        title: "Your daily photo is ready",
        body: "See which photo you got and capture your moment — it takes less than 2 minutes.",
      };
    case "question":
      return {
        title: "Your daily prompt is ready",
        body: "Share a recent memory or moment — it takes less than 2 minutes.",
      };
  }
}

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
      return new Response(
        JSON.stringify({ ok: true, morning: 0, daily: 0, streak: 0 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const userIds = [...new Set(list.map((t) => t.user_id))];

    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select(
        "id, notification_enabled, streak_at_risk_enabled, streak_count, last_morning_push_local_date, last_daily_push_local_date, last_streak_risk_push_local_date, notification_timezone, notification_time"
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

    const morningTickets: Parameters<typeof sendExpoPushTickets>[0] = [];
    const dailyTickets: Parameters<typeof sendExpoPushTickets>[0] = [];
    const streakTickets: Parameters<typeof sendExpoPushTickets>[0] = [];
    const morningUserUpdates = new Map<string, string>();
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

      const promptT = parseLocalPromptTime(p.notification_time);
      const inMorningWindow = inTimeWindow(hour, minute, promptT.hour, promptT.minute);
      const inDailyWindow = hour === 18 && minute < 20;
      const inStreakWindow = hour === 21 && minute < 20;

      // --- 7 AM: morning prompt push (always, unless already sent today) ---
      if (inMorningWindow && p.last_morning_push_local_date !== todayStr) {
        const promptType = getPromptTypeForDate(local);
        const { title, body } = getMorningPush(promptType);
        morningTickets.push({
          to: row.expo_push_token,
          title,
          body,
          sound: "default",
          priority: "high",
          channelId: ANDROID_CHANNEL,
        });
        morningUserUpdates.set(row.user_id, todayStr);
      }

      // --- 6 PM: gentle reminder only if user hasn't answered today's prompt ---
      if (inDailyWindow && p.last_daily_push_local_date !== todayStr) {
        if (!(await hasMomentToday(row.user_id, todayStr))) {
          dailyTickets.push({
            to: row.expo_push_token,
            title: "Your prompt is waiting",
            body: "Take a minute to answer today's prompt and keep adding memories to your capsule.",
            sound: "default",
            priority: "high",
            channelId: ANDROID_CHANNEL,
          });
          dailyUserUpdates.set(row.user_id, todayStr);
        }
      }

      // --- 9 PM: streak at risk ---
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

    await sendExpoPushTickets(morningTickets);
    await sendExpoPushTickets(dailyTickets);
    await sendExpoPushTickets(streakTickets);

    for (const [id, date] of morningUserUpdates) {
      await supabase
        .from("profiles")
        .update({ last_morning_push_local_date: date })
        .eq("id", id);
    }

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
        morning: morningTickets.length,
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
