import { supabase } from "./supabase";
import { captureException } from "./errors";

/**
 * Tell the server a lifecycle event happened. The server validates
 * eligibility against authoritative DB state and decides whether to
 * dispatch a push / email — clients are NOT trusted to gate
 * notifications themselves.
 *
 * Fire-and-forget: callers should not block UI on the response. Any
 * delivery failure is server-side; this function silently swallows
 * network errors so a flaky connection never derails the action that
 * triggered it (pinning a moment, completing a streak, sharing).
 *
 * Server endpoint: `supabase/functions/lifecycle-event/index.ts`.
 */
export type LifecycleEventType =
  | "first_pin"
  | "streak_milestone"
  | "share_created"
  | "paywall_bump"
  | "moment_saved";

export async function notifyLifecycleEvent(
  type: LifecycleEventType,
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await supabase.functions.invoke("lifecycle-event", {
      body: { type, context: context ?? {} },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch (err) {
    // We're fire-and-forget by contract, but we still want visibility:
    // a flaky lifecycle endpoint can quietly tank push analytics. Send
    // to PostHog so it surfaces in the exception feed (and is grouped
    // by the lifecycle type tag).
    captureException(err, {
      where: "notifyLifecycleEvent",
      lifecycle_type: type,
    });
    if (__DEV__) {
      console.warn("notifyLifecycleEvent failed:", type, err);
    }
  }
}
