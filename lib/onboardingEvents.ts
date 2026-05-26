import type { PostHogEventProperties } from "@posthog/core";

/**
 * Shared properties for the photo-focus onboarding funnel.
 *
 * Every event fired by an onboarding screen should spread `onboardingEventProps(stepIndex)`
 * so we can isolate this funnel from the legacy v2 events in PostHog.
 *
 * Funnel stages (step_index):
 *   0. quiz (pre-auth — Q1..Q5 + mirror)
 *   1. splash
 *   2. sign-in (+ post-auth welcome 2.png — use screen: post_auth_welcome in extras)
 *   3. photo-permission
 *   4. activation
 *   5. reveal
 *   6. notifications (When?)
 *   7. paywall value-anchor (skippable; not persisted as onboarding_phase)
 *   8. paywall (RevenueCat purchase; skippable; not persisted as onboarding_phase)
 */
export const ONBOARDING_FUNNEL_VERSION = "photo_focus_quiz_v1" as const;

export type OnboardingStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export function onboardingEventProps(
  stepIndex: OnboardingStepIndex,
  extra?: PostHogEventProperties
): PostHogEventProperties {
  return {
    funnel_version: ONBOARDING_FUNNEL_VERSION,
    step_index: stepIndex,
    ...(extra ?? {}),
  };
}
