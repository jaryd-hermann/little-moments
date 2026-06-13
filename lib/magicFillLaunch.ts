import { router } from "expo-router";
import { syncMagicFillStartedToProfile } from "@/lib/magicFillProfileSync";

export type MagicFillEntrySource =
  | "capsule_header"
  | "capsule_banner"
  | "capture_banner"
  | "push"
  | "push_lapsed"
  | "push_engaged";

export function launchMagicFill(source: MagicFillEntrySource) {
  void syncMagicFillStartedToProfile();
  router.push({ pathname: "/magic-fill", params: { source } });
}
