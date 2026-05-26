/**
 * After onboarding routes through the paywall, the next automatic paywall
 * trigger should be skipped once (e.g. Today tab mount) so we don't
 * immediately stack a second paywall.
 */
let paywallTriggerSkipsPending = 0;

export function requestPaywallTriggerSkips(count: number) {
  paywallTriggerSkipsPending += count;
}

export function consumePaywallTriggerSkip(): boolean {
  if (paywallTriggerSkipsPending <= 0) return false;
  paywallTriggerSkipsPending -= 1;
  return true;
}
