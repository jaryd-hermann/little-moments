/**
 * Tiny in-memory handoff for state that needs to survive between onboarding
 * screens without lifting into a persisted store.
 */

import type { MediaAsset } from "@/hooks/useMediaLibrary";

let activationPhotoUri: string | undefined;
let firstCaptureAsset: MediaAsset | undefined;

export function setActivationPhotoUri(uri: string | undefined): void {
  activationPhotoUri = uri;
}

export function consumeActivationPhotoUri(): string | undefined {
  const v = activationPhotoUri;
  activationPhotoUri = undefined;
  return v;
}

export function setFirstCaptureAsset(asset: MediaAsset | undefined): void {
  firstCaptureAsset = asset;
}

export function consumeFirstCaptureAsset(): MediaAsset | undefined {
  const v = firstCaptureAsset;
  firstCaptureAsset = undefined;
  return v;
}
