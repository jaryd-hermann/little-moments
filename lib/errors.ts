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
  const err = error instanceof Error ? error : new Error(String(error));
  if (client) {
    try {
      client.captureException(err, properties);
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
    console.error("captureException (no client):", err, properties);
  }
}
