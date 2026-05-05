import { FirstPinCelebrationSheet } from "@/components/common/FirstPinCelebrationSheet";
import { useFirstPinCelebrationStore } from "@/store/firstPinCelebrationStore";

/**
 * Mounts at the (tabs) layout root so the celebration stays alive across
 * tab switches and overlays (e.g. the entry detail screen) and so the sheet
 * can be triggered from anywhere via `useFirstPinCelebrationStore.show()`.
 */
export function FirstPinCelebrationHost() {
  const visible = useFirstPinCelebrationStore((s) => s.visible);
  const dismiss = useFirstPinCelebrationStore((s) => s.dismiss);

  return <FirstPinCelebrationSheet visible={visible} onClose={dismiss} />;
}
