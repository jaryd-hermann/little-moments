import { MomentCelebrationModal } from "@/components/today/MomentCelebrationModal";
import { useMomentCelebrationStore } from "@/store/momentCelebrationStore";

/** Renders at tab layout so celebration still shows after composer dismisses. */
export function MomentCelebrationHost() {
  const visible = useMomentCelebrationStore((s) => s.visible);
  const momentNumber = useMomentCelebrationStore((s) => s.momentNumber);
  const dismiss = useMomentCelebrationStore((s) => s.dismiss);

  return (
    <MomentCelebrationModal
      visible={visible}
      momentNumber={momentNumber}
      onDismiss={dismiss}
    />
  );
}
