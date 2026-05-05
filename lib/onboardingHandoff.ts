/**
 * Tiny in-memory handoff for state that needs to survive between onboarding
 * screens (activation → reveal → notifications-prompt) without lifting into
 * a persisted store.
 *
 * Today this exists to carry the activation photo's *local* file/asset URI
 * forward so that when the user enables notifications on the final prompt
 * screen we can fire a first-moment "You captured your 1st moment"
 * `expo-notifications` push with the photo attached — at that point the
 * entry's `media` row only has the uploaded `storage_url`, which iOS
 * notification attachments don't accept.
 *
 * Module state is fine here because:
 *   1. The JS runtime lives across all onboarding screens in RN.
 *   2. We always clear after the first read, so a restart mid-flow just
 *      falls back to a text-only push.
 *   3. This is strictly ephemeral — nothing here should ever be persisted.
 */

let activationPhotoUri: string | undefined;

export function setActivationPhotoUri(uri: string | undefined): void {
  activationPhotoUri = uri;
}

/**
 * Returns the stashed URI and clears it. Subsequent calls return undefined
 * until `setActivationPhotoUri` is called again. Clearing on read guarantees
 * we never double-fire or replay a stale push after re-entering onboarding.
 */
export function consumeActivationPhotoUri(): string | undefined {
  const v = activationPhotoUri;
  activationPhotoUri = undefined;
  return v;
}
