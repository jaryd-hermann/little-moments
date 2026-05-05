import type { PostHogEventProperties } from "@posthog/core";

/**
 * Shared properties for the photo-focus onboarding funnel.
 *
 * Every event fired by an onboarding screen should spread `onboardingEventProps(stepIndex)`
 * so we can isolate this funnel from the legacy v2 events in PostHog.
 *
 * Funnel stages (step_index):
 *   1. splash
 *   2. sign-in
 *   3. photo-permission
 *   4. activation
 *   5. reveal
 *   6. notifications
 */
export const ONBOARDING_FUNNEL_VERSION = "photo_focus_v1" as const;

export type OnboardingStepIndex = 1 | 2 | 3 | 4 | 5 | 6;

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
