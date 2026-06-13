import { useCallback } from "react";
import { Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useEntries } from "@/hooks/useEntries";
import { useEntryStore } from "@/store/entryStore";
import { CoreMemoryIcon } from "@/components/common/CoreMemoryIcon";
import { notifyLifecycleEvent } from "@/lib/lifecycleEvent";
import { useCoreMemoryAddedStore } from "@/store/coreMemoryAddedStore";

type EntryPinToggleProps = {
  entryId: string;
  /** When false, no-op (e.g. chapter rows). */
  enabled?: boolean;
  size?: number;
};

export function EntryPinToggle({
  entryId,
  enabled = true,
  size = 36,
}: EntryPinToggleProps) {
  const { editEntry } = useEntries();
  const isCore = useEntryStore(
    (s) => s.entries.find((e) => e.id === entryId)?.is_pinned ?? false
  );

  const onPress = useCallback(() => {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !isCore;
    if (next) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    if (next) {
      const entries = useEntryStore.getState().entries;
      const priorCore = entries.filter(
        (e) => e.is_pinned && e.id !== entryId
      ).length;
      const nextCore = priorCore + 1;
      useCoreMemoryAddedStore.getState().show(nextCore);
      if (nextCore === 1) {
        void notifyLifecycleEvent("first_pin");
      }
    }

    void editEntry(entryId, { is_pinned: next });
  }, [enabled, editEntry, entryId, isCore]);

  if (!enabled) return null;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={
        isCore ? "Remove core memory" : "Mark as core memory"
      }
      style={({ pressed }) => [
        styles.hit,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <CoreMemoryIcon size={size} active={isCore} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
});
