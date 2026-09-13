/**
 * Side-channel access to the PostHog instance for non-component code.
 *
 * The app uses <PostHogProvider> to create the SDK instance, which means
 * `usePostHog()` only works inside the React tree. Plenty of our async
 * paths (lifecycleEvent, streak, shareMoment, etc.) live in `lib/*` and
 * don't have access to that hook. Rather than thread the instance through
 * every helper, we register the instance once at boot and let other
 * modules read it via `captureException()`.
 *
 * Wire-up: `app/_layout.tsx` calls `registerPostHogClient(usePostHog())`
 * inside an effect — that's the only place that owns the instance.
 *
 * Behavior when unset:
 *   - Pre-boot or in environments without PostHog (web, tests): callers
 *     should still be safe. `captureException` falls back to console.error
 *     so we never silently lose an error AND never throw from the call site.
 */
import type { PostHog } from "posthog-react-native";

let client: PostHog | null = null;

export function registerPostHogClient(c: PostHog | null): void {
  client = c;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Coerces a caught value into an Error plus any extra fields worth reporting.
 *
 * Supabase (and many SDK) errors are plain objects like
 * `{ message, code, details, hint }`, not Error instances. `String(error)` on
 * those yields "[object Object]", which erases the real cause and groups every
 * such error under one useless title. We lift the message onto the Error and
 * keep code/details/hint as properties so PostHog shows and groups them.
 */
function toError(error: unknown): {
  err: Error;
  extra?: Record<string, unknown>;
} {
  if (error instanceof Error) return { err: error };

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    const message =
      typeof obj.message === "string" && obj.message.length > 0
        ? obj.message
        : safeStringify(obj);
    const extra: Record<string, unknown> = {};
    if (obj.code != null) extra.error_code = obj.code;
    if (obj.details != null) extra.error_details = obj.details;
    if (obj.hint != null) extra.error_hint = obj.hint;
    return {
      err: new Error(message),
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    };
  }

  return { err: new Error(String(error)) };
}

/**
 * Captures a caught exception. Safe to call before/without PostHog being
 * configured — falls back to console so the error is never silently lost.
 *
 * The first argument is intentionally typed `unknown` because that's the
 * type of `catch (e)` in TypeScript without `useUnknownInCatchVariables`.
 * The SDK accepts any value, but we coerce non-Errors to Error so the
 * exception surface in PostHog has a real stack to render.
 */
export function captureException(
  error: unknown,
  properties?: Record<string, unknown>,
): void {
  const { err, extra } = toError(error);
  const merged = extra ? { ...extra, ...properties } : properties;
  if (client) {
    try {
      client.captureException(err, merged);
      return;
    } catch (innerErr) {
      // The SDK itself can't be allowed to break callers — fall through
      // to console so the original error is at least surfaced.
      if (__DEV__) {
        console.error("captureException SDK failed:", innerErr);
      }
    }
  }
  if (__DEV__) {
    console.error("captureException (no client):", err, merged);
  }
}
