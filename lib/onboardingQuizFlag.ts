/**
 * PostHog feature flag controlling whether new users see the pre-auth quiz.
 *
 * Variants (configure in PostHog):
 * - `control` → splash → quiz → mirror → sign-in (default)
 * - `test`    → splash → sign-in (skip quiz)
 */
export const ONBOARDING_QUIZ_FLAG_KEY = "quiz";

export type OnboardingQuizVariant = "control" | "test";

export function resolveOnboardingQuizVariant(
  flagValue: string | boolean | undefined
): OnboardingQuizVariant {
  if (flagValue === "test" || flagValue === true) return "test";
  return "control";
}

export function shouldSkipOnboardingQuiz(
  flagValue: string | boolean | undefined
): boolean {
  return resolveOnboardingQuizVariant(flagValue) === "test";
}

export function shouldSkipOnboardingPaywall(
  flagValue: string | boolean | undefined
): boolean {
  return shouldSkipOnboardingQuiz(flagValue);
}
