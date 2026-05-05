/**
 * Lifecycle dispatch helper — single entry point for sending pushes
 * and emails through the lifecycle messaging system.
 *
 * Why this exists:
 *   - Idempotency for one-shot events (first-pin push fires once, ever).
 *   - Frequency caps for premium pitches (≤1 per user per 7 days across
 *     all premium event_keys).
 *   - Single audit log (`lifecycle_dispatches`) for funnel attribution.
 *   - Channel routing without duplicating OneSignal/Resend boilerplate
 *     across every cron / trigger.
 *
 * Usage:
 *   await dispatch(supabase, {
 *     userId: "...",
 *     eventKey: "first_pin_push",
 *     channel: "push",
 *     oneShot: true,
 *     push: { title: "You just started your album.", body: "...", data: { type: "first_pin" } },
 *   });
 *
 * Returns { sent, reason } — `reason` explains skips for callers that
 * want to log them (e.g. "already_sent", "freq_cap", "no_email").
 */
import { sendOneSignalPush } from "./onesignal-push.ts";
import { sendEmail } from "./resend.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type LifecycleChannel = "push" | "email";

export interface DispatchPushOpts {
  title: string;
  body: string;
  imageUrl?: string;
  /**
   * Custom payload exposed to the client via OneSignal's
   * `event.notification.additionalData`. Use the `type` field to route
   * the tap (see `app/_layout.tsx` click listener).
   */
  data?: Record<string, unknown>;
}

export interface DispatchEmailOpts {
  to: string;
  subject: string;
  html: string;
}

export interface DispatchOpts {
  userId: string;
  /**
   * Stable identifier for this logical message. Used for:
   *   - one-shot idempotency (with `oneShot: true`)
   *   - frequency cap matching (premium events bucket together
   *     under their `event_key` prefix).
   * Keep it dataless — no per-event ids. Include those in `payload`.
   */
  eventKey: string;
  channel: LifecycleChannel;
  /**
   * If true, the dispatch helper checks `lifecycle_dispatches` for an
   * existing row with the same (user_id, event_key) and skips the
   * send if one is found. The unique partial index (see migration
   * 0041) is the safety net.
   */
  oneShot?: boolean;
  /**
   * If set, the dispatch helper enforces a per-user frequency cap:
   * skip if any row exists with `event_key LIKE freqCap.keyPrefix%`
   * within the last `freqCap.windowDays` days. Used for premium
   * pitches (max 1 / 7 days across all premium variants).
   */
  freqCap?: { keyPrefix: string; windowDays: number };
  payload?: Record<string, unknown>;
  push?: DispatchPushOpts;
  email?: DispatchEmailOpts;
}

export interface DispatchResult {
  sent: boolean;
  reason?:
    | "already_sent"
    | "freq_cap"
    | "missing_payload"
    | "send_error";
  error?: string;
}

/**
 * Idempotency check for one-shot events. Returns true if the user has
 * already received this `event_key`.
 */
async function alreadySent(
  supabase: SupabaseClient,
  userId: string,
  eventKey: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lifecycle_dispatches")
    .select("id")
    .eq("user_id", userId)
    .eq("event_key", eventKey)
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Frequency-cap check. Returns true if the user has received any
 * dispatch with `event_key LIKE keyPrefix%` within `windowDays`.
 */
async function freqCapHit(
  supabase: SupabaseClient,
  userId: string,
  keyPrefix: string,
  windowDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString();
  const { data } = await supabase
    .from("lifecycle_dispatches")
    .select("id")
    .eq("user_id", userId)
    .gte("sent_at", since)
    .like("event_key", `${keyPrefix}%`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function logDispatch(
  supabase: SupabaseClient,
  opts: DispatchOpts,
): Promise<void> {
  // The unique partial index on (user_id, event_key) WHERE is_one_shot=true
  // protects against a race where two cron ticks both pass the
  // `alreadySent` check for the same user/event. We swallow that 23505.
  const { error } = await supabase.from("lifecycle_dispatches").insert({
    user_id: opts.userId,
    event_key: opts.eventKey,
    channel: opts.channel,
    payload: opts.payload ?? {},
    is_one_shot: !!opts.oneShot,
  });
  if (error && error.code !== "23505") {
    // Insert failed for a non-duplicate reason — surface it so the
    // caller's logs show the issue. We've already sent the message,
    // so we can't roll back; the worst case is a re-send on the next
    // tick, which is preferable to silent loss.
    console.error("dispatch log insert error:", error.message);
  }
}

export async function dispatch(
  supabase: SupabaseClient,
  opts: DispatchOpts,
): Promise<DispatchResult> {
  if (opts.oneShot && await alreadySent(supabase, opts.userId, opts.eventKey)) {
    return { sent: false, reason: "already_sent" };
  }
  if (
    opts.freqCap &&
    await freqCapHit(
      supabase,
      opts.userId,
      opts.freqCap.keyPrefix,
      opts.freqCap.windowDays,
    )
  ) {
    return { sent: false, reason: "freq_cap" };
  }

  try {
    if (opts.channel === "push") {
      if (!opts.push) return { sent: false, reason: "missing_payload" };
      await sendOneSignalPush({
        externalIds: [opts.userId],
        title: opts.push.title,
        body: opts.push.body,
        imageUrl: opts.push.imageUrl,
        data: opts.push.data,
      });
    } else {
      if (!opts.email) return { sent: false, reason: "missing_payload" };
      await sendEmail({
        to: opts.email.to,
        subject: opts.email.subject,
        html: opts.email.html,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `dispatch send error [${opts.channel}/${opts.eventKey}]:`,
      message,
    );
    return { sent: false, reason: "send_error", error: message };
  }

  await logDispatch(supabase, opts);
  return { sent: true };
}

/**
 * Bulk push helper for crons that fan out the SAME message to many
 * users (daily nudge, weekly chapter intro). Logs one row per recipient.
 *
 * NOTE: this skips the per-user `oneShot` / `freqCap` checks for
 * efficiency — those checks are caller-provided (the cron filters its
 * recipient list before calling here). Use `dispatch()` if you need
 * per-user gating with a single message.
 */
export async function dispatchBulkPush(
  supabase: SupabaseClient,
  opts: {
    userIds: string[];
    eventKey: string;
    push: DispatchPushOpts;
    payload?: Record<string, unknown>;
    isOneShot?: boolean;
  },
): Promise<{ sent: number }> {
  const ids = [...new Set(opts.userIds)].filter(Boolean);
  if (ids.length === 0) return { sent: 0 };

  await sendOneSignalPush({
    externalIds: ids,
    title: opts.push.title,
    body: opts.push.body,
    imageUrl: opts.push.imageUrl,
    data: opts.push.data,
  });

  const rows = ids.map((id) => ({
    user_id: id,
    event_key: opts.eventKey,
    channel: "push",
    payload: opts.payload ?? {},
    is_one_shot: !!opts.isOneShot,
  }));

  // 100-row chunks keep the request body under PostgREST's default cap.
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from("lifecycle_dispatches")
      .insert(chunk);
    if (error && error.code !== "23505") {
      console.error("dispatchBulkPush log error:", error.message);
    }
  }

  return { sent: ids.length };
}
