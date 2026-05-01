import { useCallback } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useEntries } from "@/hooks/useEntries";
import { useEntryStore } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { ThumbtackIcon } from "@/components/common/ThumbtackIcon";

type EntryPinToggleProps = {
  entryId: string;
  /** When false, no-op (e.g. chapter rows). */
  enabled?: boolean;
  size?: number;
};

export function EntryPinToggle({
  entryId,
  enabled = true,
  size = 22,
}: EntryPinToggleProps) {
  const { colors } = useTheme();
  const { editEntry } = useEntries();
  const isPinned = useEntryStore(
    (s) => s.entries.find((e) => e.id === entryId)?.is_pinned ?? false
  );

  const onPress = useCallback(() => {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !isPinned;
    if (next) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    void editEntry(entryId, { is_pinned: next });
  }, [enabled, editEntry, entryId, isPinned]);

  if (!enabled) return null;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={isPinned ? "Unpin moment" : "Pin moment"}
      style={({ pressed }) => [
        styles.hit,
        { opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View
        style={[
          styles.circle,
          isPinned
            ? {
                borderColor: "#000000",
                backgroundColor: colors.primary,
              }
            : {
                borderColor: "rgba(0,0,0,0.14)",
                backgroundColor: "#FFFFFF",
              },
        ]}
      >
        <ThumbtackIcon
          size={Math.round(size * 0.82)}
          color="#000000"
          weight={isPinned ? "solid" : "regular"}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
