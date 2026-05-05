/**
 * Hourly OneSignal tag sync — keeps dashboard segmentation fresh for
 * users who haven't opened the app recently (where the client-side
 * sync hooks don't run).
 *
 * Computed tags per user:
 *   - total_moments         : profiles.total_moments
 *   - has_captured_moment   : "true" | "false"
 *   - current_streak        : profiles.streak_count
 *   - longest_streak        : profiles.longest_streak
 *   - total_pinned          : COUNT(entries WHERE is_pinned)
 *   - total_chapters        : COUNT(chapters WHERE user_id = ...)
 *   - total_chapters_seen   : COUNT(chapters WHERE viewed_at IS NOT NULL)
 *   - total_threads         : COUNT(threads WHERE NOT dismissed)
 *   - total_threads_seen    : COUNT(threads WHERE viewed_at IS NOT NULL)
 *   - subscription_status   : 'free' | 'trial' | 'active' | 'expired' | 'cancelled'
 *   - is_paid               : "true" | "false"
 *   - signup_date           : "YYYY-MM-DD" (UTC)
 *   - account_age_days      : whole days since profiles.created_at
 *   - last_capture_date     : profiles.last_entry_date or ""
 *   - days_since_last_capture : whole days since last_entry_date (or "999"
 *                               if never captured — sortable but distinct)
 *   - activation_state      : 'unactivated' | 'activating' | 'active'
 *                             | 'lapsed' | 'dormant'
 *   - notification_timezone : profiles.notification_timezone or ""
 *   - notification_time     : profiles.notification_time HH:MM
 *
 * Activation state model (single tag, easy dashboard filter):
 *   unactivated  : 0 moments
 *   activating   : 1–4 moments AND last 7d
 *   active       : 5+ moments AND last 7d
 *   lapsed       : last_capture between 7d and 30d ago
 *   dormant      : last_capture > 30d ago
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Required env (Supabase secrets):
 *   - CRON_SECRET
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { updateOneSignalTagsBatch, type UserTags } from "../_shared/onesignal-tags.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

type ProfileRow = {
  id: string;
  notification_enabled: boolean;
  notification_time: string | null;
  notification_timezone: string | null;
  subscription_status: string;
  total_moments: number | null;
  streak_count: number | null;
  longest_streak: number | null;
  last_entry_date: string | null;
  created_at: string;
};

function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 999;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return 999;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

function activationState(
  totalMoments: number,
  daysSinceLastCapture: number,
): string {
  if (totalMoments === 0) return "unactivated";
  if (daysSinceLastCapture > 30) return "dormant";
  if (daysSinceLastCapture > 7) return "lapsed";
  if (totalMoments >= 5) return "active";
  return "activating";
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "cron-onesignal-sync" });
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
        "id, notification_enabled, notification_time, notification_timezone, subscription_status, total_moments, streak_count, longest_streak, last_entry_date, created_at",
      );

    if (profErr || !profiles) {
      return new Response(JSON.stringify({ error: profErr?.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userIds = (profiles as ProfileRow[]).map((p) => p.id);

    // Fan-out lookups: one query per metric, then index by user for the
    // per-row tag computation. Keeps round trips bounded as user count grows.

    const pinCounts = new Map<string, number>();
    {
      const { data: rows } = await supabase
        .from("entries")
        .select("user_id")
        .eq("entry_type", "moment")
        .eq("is_pinned", true)
        .in("user_id", userIds);
      for (const r of rows ?? []) {
        pinCounts.set(r.user_id, (pinCounts.get(r.user_id) ?? 0) + 1);
      }
    }

    const chapterTotals = new Map<string, number>();
    const chaptersSeen = new Map<string, number>();
    {
      const { data } = await supabase
        .from("chapters")
        .select("user_id, viewed_at")
        .in("user_id", userIds);
      for (const r of data ?? []) {
        chapterTotals.set(r.user_id, (chapterTotals.get(r.user_id) ?? 0) + 1);
        if (r.viewed_at) {
          chaptersSeen.set(r.user_id, (chaptersSeen.get(r.user_id) ?? 0) + 1);
        }
      }
    }

    const threadTotals = new Map<string, number>();
    const threadsSeen = new Map<string, number>();
    {
      const { data } = await supabase
        .from("threads")
        .select("user_id, viewed_at, dismissed")
        .in("user_id", userIds)
        .eq("dismissed", false);
      for (const r of data ?? []) {
        threadTotals.set(r.user_id, (threadTotals.get(r.user_id) ?? 0) + 1);
        if (r.viewed_at) {
          threadsSeen.set(r.user_id, (threadsSeen.get(r.user_id) ?? 0) + 1);
        }
      }
    }

    const updates: { userId: string; tags: UserTags }[] = [];

    for (const p of profiles as ProfileRow[]) {
      const totalMoments = p.total_moments ?? 0;
      const dsl = daysSince(p.last_entry_date);
      const isPaid =
        p.subscription_status === "active" || p.subscription_status === "trial";
      const totalPinned = pinCounts.get(p.id) ?? 0;
      const totalChapters = chapterTotals.get(p.id) ?? 0;
      const totalChaptersSeen = chaptersSeen.get(p.id) ?? 0;
      const totalThreads = threadTotals.get(p.id) ?? 0;
      const totalThreadsSeen = threadsSeen.get(p.id) ?? 0;
      const accountAgeDays = daysSince(p.created_at);
      const signupDate = p.created_at?.slice(0, 10) ?? "";

      updates.push({
        userId: p.id,
        tags: {
          total_moments: totalMoments,
          has_captured_moment: totalMoments >= 1 ? "true" : "false",
          current_streak: p.streak_count ?? 0,
          longest_streak: p.longest_streak ?? 0,
          total_pinned: totalPinned,
          has_pinned: totalPinned >= 1 ? "true" : "false",
          total_chapters: totalChapters,
          total_chapters_seen: totalChaptersSeen,
          total_threads: totalThreads,
          total_threads_seen: totalThreadsSeen,
          subscription_status: p.subscription_status,
          is_paid: isPaid ? "true" : "false",
          signup_date: signupDate,
          account_age_days: accountAgeDays,
          last_capture_date: p.last_entry_date ?? "",
          days_since_last_capture: dsl,
          activation_state: activationState(totalMoments, dsl),
          notification_timezone: p.notification_timezone ?? "",
          notification_time: p.notification_time?.slice(0, 5) ?? "",
        },
      });
    }

    await updateOneSignalTagsBatch(updates, 5);

    logger.info("cron_onesignal_sync.completed", {
      duration_ms: Date.now() - startedAt,
      profiles_scanned: profiles.length,
      synced: updates.length,
    });
    await logger.flush();

    return new Response(
      JSON.stringify({ ok: true, synced: updates.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error("cron-onesignal-sync error:", message);
    logger.error("cron_onesignal_sync.failed", {
      duration_ms: Date.now() - startedAt,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
