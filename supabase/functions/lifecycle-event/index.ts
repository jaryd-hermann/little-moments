/**
 * Lifecycle event endpoint — single entry point for client-triggered
 * lifecycle pushes / emails. The client posts an event here when
 * something product-meaningful happens (first pin, streak milestone,
 * share created, etc.); the server validates eligibility and decides
 * whether to dispatch.
 *
 * Why server-driven dispatch (vs. firing OneSignal directly from the
 * client):
 *   - Eligibility checks ("is this REALLY their first pin?", "did they
 *     actually hit a 7-day streak?") run against authoritative DB
 *     state, not optimistic client state.
 *   - Frequency caps + idempotency live in `lifecycle_dispatches`.
 *   - Single source of truth for copy / channel / tag updates.
 *
 * Auth: standard user JWT (Authorization: Bearer <access_token>).
 *       The function is deployed with `verify_jwt = false` so the
 *       handler can return a friendly 401 instead of the gateway
 *       eating the request — see existing functions for the same pattern.
 *
 * Request body:
 *   {
 *     "type": "first_pin" | "streak_milestone" | "share_created" | "paywall_bump",
 *     "context"?: Record<string, unknown>
 *   }
 *
 * Response:
 *   200 { ok: true, dispatched: boolean, reason?: string }
 *   400 { error: "invalid_event" }
 *   401 { error: "Unauthorized" }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { dispatch } from "../_shared/dispatch.ts";
import { createPostHogLogger } from "../_shared/posthog-logs.ts";

type EventType =
  | "first_pin"
  | "streak_milestone"
  | "share_created"
  | "paywall_bump"
  | "moment_saved";

const STREAK_MILESTONES = new Set([3, 7, 30, 100]);

interface RequestBody {
  type: EventType;
  context?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  const logger = createPostHogLogger({ service: "lifecycle-event" });
  const startedAt = Date.now();
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!body?.type) {
    return new Response(JSON.stringify({ error: "invalid_event" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Service-role client for DB reads + dispatch logging (RLS bypass —
  // the user has been authenticated above; we want to read full state
  // without RLS narrowing).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let result: { sent: boolean; reason?: string } = { sent: false };

    switch (body.type) {
      case "first_pin":
        result = await handleFirstPin(supabase, userId);
        break;

      case "streak_milestone":
        result = await handleStreakMilestone(supabase, userId);
        break;

      case "share_created":
        result = await handleShareCreated(supabase, userId, body.context);
        break;

      case "paywall_bump":
        result = await handlePaywallBump(supabase, userId, body.context);
        break;

      case "moment_saved":
        result = await handleMomentSaved(supabase, userId, body.context);
        break;

      default:
        return new Response(JSON.stringify({ error: "invalid_event" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
    }

    // Single wide event per request — captures the most useful debug
    // facets without leaking the request body.
    logger.info("lifecycle_event.handled", {
      duration_ms: Date.now() - startedAt,
      posthog_distinct_id: userId,
      event_type: body.type,
      dispatched: result.sent,
      reason: result.reason ?? "",
    });
    await logger.flush();

    return new Response(
      JSON.stringify({
        ok: true,
        dispatched: result.sent,
        reason: result.reason,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "error";
    console.error(`lifecycle-event ${body.type} error:`, message);
    logger.error("lifecycle_event.failed", {
      duration_ms: Date.now() - startedAt,
      posthog_distinct_id: userId,
      event_type: body.type,
      error: message,
    });
    await logger.flush();
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});

/**
 * First-pin: fires a one-shot push when the user has exactly 1 pinned
 * moment. We re-check the count server-side rather than trust the client.
 */
async function handleFirstPin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { count } = await supabase
    .from("entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("entry_type", "moment")
    .eq("is_pinned", true);

  if ((count ?? 0) !== 1) {
    return { sent: false, reason: "not_first_pin" };
  }

  return await dispatch(supabase, {
    userId,
    eventKey: "first_pin",
    channel: "push",
    oneShot: true,
    push: {
      title: "You just started your album",
      body: "Pinned moments become your printed book. Keep choosing.",
      data: { type: "first_pin" },
    },
  });
}

/**
 * Streak milestone: 3 / 7 / 30 / 100 — one-shot per user per milestone.
 * Reads `profiles.streak_count` server-side rather than trusting the
 * client.
 */
async function handleStreakMilestone(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("streak_count")
    .eq("id", userId)
    .maybeSingle();

  const streak = profile?.streak_count ?? 0;
  if (!STREAK_MILESTONES.has(streak)) {
    return { sent: false, reason: "not_milestone" };
  }

  const { title, body } = streakCopy(streak);
  return await dispatch(supabase, {
    userId,
    eventKey: `streak_milestone:${streak}`,
    channel: "push",
    oneShot: true,
    payload: { streak },
    push: {
      title,
      body,
      data: { type: "streak_milestone" },
    },
  });
}

function streakCopy(streak: number): { title: string; body: string } {
  switch (streak) {
    case 3:
      return {
        title: "Streak of 3",
        body: "The hard part's done. The habit is forming.",
      };
    case 7:
      return {
        title: "A week of moments",
        body: "Seven days. This is the part where it starts to compound.",
      };
    case 30:
      return {
        title: "30 days, captured",
        body: "A month of your life — most of which would've slipped past.",
      };
    case 100:
      return {
        title: "100 moments",
        body: "Most people don't remember last week. You have a year.",
      };
    default:
      return { title: `Streak of ${streak}`, body: "Keep going." };
  }
}

/**
 * Share created: sender-side ack push. Recipient handling is out of
 * scope (not all recipients are app users; that's a viral-loop
 * problem, not a lifecycle one).
 *
 * One-shot keyed off the entry_id so re-creating the share link for
 * the same moment doesn't double-fire.
 */
async function handleShareCreated(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  context: Record<string, unknown> | undefined,
) {
  const entryId = typeof context?.entry_id === "string"
    ? context.entry_id
    : null;
  if (!entryId) return { sent: false, reason: "missing_entry_id" };

  // Verify the entry is the user's (defensive — RLS should already
  // prevent cross-user share creation, but the dispatch logs would
  // be wrong otherwise).
  const { data: entry } = await supabase
    .from("entries")
    .select("id")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!entry) return { sent: false, reason: "entry_not_found" };

  return await dispatch(supabase, {
    userId,
    eventKey: `share_created:${entryId}`,
    channel: "push",
    oneShot: true,
    payload: { entry_id: entryId },
    push: {
      title: "Share link ready",
      body: "Send it to anyone — they'll see just this moment.",
      data: { type: "share_created", entry_id: entryId },
    },
  });
}

/**
 * Paywall bump: user tapped a locked chapter / thread (or hit any
 * other free-tier ceiling). Logs a row in `paywall_bumps` for the
 * reactive premium pitch (b2 / c2). The follow-up email is fired by
 * the lifecycle-emails cron the next morning, not from here — that
 * way the user has time to convert in-app first.
 *
 * Context: { surface: 'chapter' | 'thread' | 'capsule_full' | 'album',
 *            ref_id?: string }
 */
async function handlePaywallBump(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  context: Record<string, unknown> | undefined,
) {
  const surface = typeof context?.surface === "string" ? context.surface : null;
  const refId = typeof context?.ref_id === "string" ? context.ref_id : null;
  const validSurfaces = ["chapter", "thread", "capsule_full", "album"];
  if (!surface || !validSurfaces.includes(surface)) {
    return { sent: false, reason: "invalid_surface" };
  }

  const { error } = await supabase.from("paywall_bumps").insert({
    user_id: userId,
    surface,
    ref_id: refId,
  });
  if (error) {
    console.error("paywall_bump insert error:", error.message);
    return { sent: false, reason: "log_error" };
  }
  // No immediate dispatch — the reactive email is fired by
  // cron-lifecycle-emails the next morning so the user has a chance
  // to convert in-app first.
  return { sent: false, reason: "logged" };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * Moment saved: celebratory push fired from the client right after the
 * just-saved entry's media row is in place. The client deliberately waits
 * for `entry_media.insert` so the row's `storage_url` is populated — this
 * push wants the public Supabase URL, not the local `file://` URI, so
 * OneSignal's NSE can render the image attachment reliably on iOS / FCM
 * `bigPicture` on Android.
 *
 * Server reads:
 *   - `entries.title` for the body line ("View 'X' in your Flipbook anytime")
 *   - `entry_media[0].storage_url` for the rich image
 *   - `profiles.total_moments` for the ordinal in the heading
 *
 * Idempotency: keyed off `event_key = "moment_saved:{entry_id}"` so client
 * retries (network blips, double-tap on save) collapse into a single push.
 *
 * Why we don't trust the client to send the title / image: copy may rewrite
 * or be enhanced asynchronously after save, and the entry's owner is the
 * authoritative source — clients can't be trusted to cite each other's
 * data.
 */
async function handleMomentSaved(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  context: Record<string, unknown> | undefined,
) {
  const entryId = typeof context?.entry_id === "string"
    ? context.entry_id
    : null;
  if (!entryId) return { sent: false, reason: "missing_entry_id" };

  const { data: entry } = await supabase
    .from("entries")
    .select("id, user_id, title, entry_type")
    .eq("id", entryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!entry) return { sent: false, reason: "entry_not_found" };
  if (entry.entry_type !== "moment") {
    return { sent: false, reason: "not_a_moment" };
  }

  // Pull the first attached photo's public URL (display_order = 0). The
  // client schedules this lifecycle event AFTER `entry_media.insert`
  // resolves, so this row is present for photo saves. Text-only saves
  // skip the JOIN cost by leaving imageUrl undefined.
  const { data: media } = await supabase
    .from("entry_media")
    .select("storage_url, display_order, media_type")
    .eq("entry_id", entryId)
    .eq("user_id", userId)
    .eq("media_type", "image")
    .order("display_order", { ascending: true })
    .limit(1);
  const imageUrl = media?.[0]?.storage_url ?? undefined;

  const { data: profile } = await supabase
    .from("profiles")
    .select("total_moments")
    .eq("id", userId)
    .maybeSingle();
  const total = Math.max(1, profile?.total_moments ?? 1);

  const title = (entry.title ?? "").trim();
  const bodyText = title.length > 0
    ? `View "${title}" in your Flipbook anytime`
    : "A new memory is in your Capsule.";

  return await dispatch(supabase, {
    userId,
    eventKey: `moment_saved:${entryId}`,
    channel: "push",
    oneShot: true,
    payload: { entry_id: entryId, total_moments: total },
    push: {
      title: `You captured your ${ordinal(total)} moment`,
      body: bodyText,
      imageUrl,
      data: { type: "moment_saved", entry_id: entryId },
    },
  });
}
