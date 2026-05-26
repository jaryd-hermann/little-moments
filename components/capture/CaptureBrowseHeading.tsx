import type { ReactNode } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";

const GUTTER = 20;

export function CaptureBrowseHeading({
  title,
  upperLabel = "CAPTURING FOR",
  hideChangeDay,
  onPressChangeDay,
  topLeftAction,
  titleAccessory,
}: {
  title: string;
  /** First line above the day title (e.g. `YOU CAPTURED` on the post-save home). */
  upperLabel?: string;
  hideChangeDay?: boolean;
  onPressChangeDay?: () => void;
  topLeftAction?: { label: string; onPress: () => void };
  /** Shown on the same row as the title (e.g. “Do a prompt instead”). */
  titleAccessory?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: GUTTER, marginBottom: 10 }}>
      {topLeftAction ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            topLeftAction.onPress();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: colors.primary,
            }}
          >
            {topLeftAction.label}
          </Text>
        </Pressable>
      ) : null}
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 11,
          letterSpacing: 1.2,
          color: colors.textMuted,
        }}
      >
        {upperLabel}
      </Text>
      {!hideChangeDay ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: 4,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressChangeDay?.();
            }}
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              flexWrap: "wrap",
              gap: 6,
              flex: 1,
              flexShrink: 1,
            }}
          >
            <Text
              style={{
                fontFamily: "PMGothicLudington-Text110",
                fontSize: 32,
                color: colors.text,
                lineHeight: 38,
              }}
            >
              {title}
            </Text>
            <View style={{ marginBottom: 6, marginLeft: 2 }}>
              <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
            </View>
          </Pressable>
          {titleAccessory ? (
            <View style={{ marginBottom: 6, alignItems: "flex-end" }}>
              {titleAccessory}
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginTop: 4,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 32,
              color: colors.text,
              lineHeight: 38,
              flex: 1,
              flexShrink: 1,
            }}
          >
            {title}
          </Text>
          {titleAccessory ? (
            <View style={{ marginBottom: 6, alignItems: "flex-end" }}>
              {titleAccessory}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}
