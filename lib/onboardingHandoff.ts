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

/** What the onboarding chat picked, and how they said they'd caption it. */
export interface FirstCaptureHandoff {
  asset: MediaAsset;
  method: "speaking" | "typing";
}

let firstCaptureHandoff: FirstCaptureHandoff | undefined;

export function setFirstCaptureHandoff(
  handoff: FirstCaptureHandoff | undefined
): void {
  firstCaptureHandoff = handoff;
}

export function consumeFirstCaptureHandoff(): FirstCaptureHandoff | undefined {
  const v = firstCaptureHandoff;
  firstCaptureHandoff = undefined;
  return v;
}
