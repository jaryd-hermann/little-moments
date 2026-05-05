import { router } from "expo-router";
import type { PostHog } from "posthog-react-native";
import { notifyLifecycleEvent } from "./lifecycleEvent";

/**
 * PostHog feature flag controlling which premium-entry surface a user sees
 * when they tap "Try Premium" / the in-app premium nudge.
 *
 * Variants (configure in PostHog):
 * - `control` → Ellie chat → upgrade → cause → pricing (default)
 * - `test`    → straight to pricing (RevenueCat paywall at `/paywall`)
 *
 * Anything unrecognized (including `undefined`) falls back to `control` so we
 * never strand users at a missing screen if the flag fails to load.
 */
export const PREMIUM_ENTRY_FLAG_KEY = "paywall";

export type PremiumEntryVariant = "control" | "test";

export function resolvePremiumEntryVariant(
  flagValue: string | boolean | undefined
): PremiumEntryVariant {
  if (flagValue === "test" || flagValue === true) return "test";
  return "control";
}

export function premiumRouteFor(variant: PremiumEntryVariant): string {
  return variant === "test" ? "/paywall" : "/ellie-premium";
}

/**
 * Surfaces that count as a "paywall bump" for the lifecycle reactive
 * pitches (premium_chapters_reactive, premium_threads_reactive). When
 * a caller hits the paywall from one of these, we log it to
 * `paywall_bumps` so cron-lifecycle-emails can fire a follow-up email
 * the next morning.
 *
 * Other premium entry sources (e.g. settings tap, "Try Premium" pill)
 * don't create a bump — they're aspirational, not high-intent.
 */
export type PaywallBumpSurface =
  | "chapter"
  | "thread"
  | "capsule_full"
  | "album";

export interface LaunchPremiumFlowOpts {
  /**
   * If set, logs a paywall_bump row for the matching reactive premium
   * pitch. Use the literal feature surface (chapter / thread / etc.),
   * not the analytics source string.
   */
  bump?: { surface: PaywallBumpSurface; refId?: string };
}

/**
 * Convenience for callbacks: read the flag off the supplied PostHog client,
 * fire an analytics event, navigate, and (if `bump` is set) log a
 * paywall_bump for the lifecycle reactive pitch.
 */
export function launchPremiumFlow(
  posthog: PostHog | undefined,
  source: string,
  opts?: LaunchPremiumFlowOpts,
): void {
  const raw = posthog?.getFeatureFlag(PREMIUM_ENTRY_FLAG_KEY);
  const variant = resolvePremiumEntryVariant(
    typeof raw === "string" || typeof raw === "boolean" ? raw : undefined
  );
  posthog?.capture("premium_entry_tapped", {
    source,
    variant,
    bump_surface: opts?.bump?.surface,
  });
  if (opts?.bump) {
    void notifyLifecycleEvent("paywall_bump", {
      surface: opts.bump.surface,
      ref_id: opts.bump.refId,
    });
  }
  router.push(premiumRouteFor(variant) as never);
}
