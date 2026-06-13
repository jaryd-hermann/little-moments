import { CoreMemoryAddedToaster } from "@/components/common/CoreMemoryAddedToaster";
import { useCoreMemoryAddedStore } from "@/store/coreMemoryAddedStore";

export function CoreMemoryAddedToasterHost() {
  const visible = useCoreMemoryAddedStore((s) => s.visible);
  const coreCount = useCoreMemoryAddedStore((s) => s.coreCount);
  const dismiss = useCoreMemoryAddedStore((s) => s.dismiss);

  return (
    <CoreMemoryAddedToaster
      visible={visible}
      coreCount={coreCount}
      onDismiss={dismiss}
    />
  );
}
