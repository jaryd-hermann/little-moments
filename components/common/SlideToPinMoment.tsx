import { useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useEntries } from "@/hooks/useEntries";
import { useEntryStore } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { CoreMemoryIcon } from "@/components/common/CoreMemoryIcon";

type SlideToPinMomentProps = {
  entryId: string;
};

export function SlideToPinMoment({ entryId }: SlideToPinMomentProps) {
  const { colors } = useTheme();
  const { editEntry } = useEntries();
  const isCore = useEntryStore(
    (s) => s.entries.find((e) => e.id === entryId)?.is_pinned ?? false
  );

  const toggle = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !isCore;
    if (next) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    void editEntry(entryId, { is_pinned: next });
  }, [editEntry, entryId, isCore]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.cardShell,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            ...Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 8,
              },
              android: { elevation: 2 },
            }),
          },
        ]}
      >
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={
            isCore ? "Remove core memory" : "Mark as core memory"
          }
          android_ripple={{ color: "rgba(0,0,0,0.08)", foreground: true }}
          style={({ pressed }) => [
            styles.pressableFill,
            { opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.textCol}>
              <Text
                style={[styles.title, { color: colors.text }]}
                selectable={false}
              >
                {isCore ? "Core Memory" : "Make this a Core Memory"}
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                selectable={false}
              >
                {isCore
                  ? "View this in your Flipbook"
                  : "Save moments that feel extra special."}
              </Text>
            </View>

            <View pointerEvents="none">
              <CoreMemoryIcon size={36} active={isCore} />
            </View>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    marginTop: 4,
    marginBottom: 16,
  },
  cardShell: {
    alignSelf: "stretch",
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: "hidden",
  },
  pressableFill: {
    width: "100%",
    backgroundColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 20,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  title: {
    fontFamily: "LibreBaskerville-Bold",
    fontSize: 17,
    lineHeight: 24,
  },
  subtitle: {
    fontFamily: "Roboto-Regular",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
});
