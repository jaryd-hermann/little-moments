import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { format, parse } from "date-fns";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { Draft } from "@/store/draftStore";
import { useDraftStore } from "@/store/draftStore";

interface DraftCardProps {
  draft: Draft;
  dateKey: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function DraftCard({ draft, dateKey }: DraftCardProps) {
  const { colors, theme } = useTheme();

  const handleResume = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    router.push({
      pathname: "/composer",
      params: { date: draft.dateISO },
    });
  };

  const handleDiscard = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useDraftStore.getState().clearDraft(dateKey);
  };

  const preview = draft.title || stripHtml(draft.body);

  return (
    <Pressable
      onPress={handleResume}
      style={{
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.primary,
        borderStyle: "dashed",
        backgroundColor: colors.surface,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: colors.primary + "22",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="document-text-outline" size={18} color={colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              backgroundColor: colors.primary + "28",
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 10,
                color: colors.primary,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Draft
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 14,
            color: colors.text,
            marginTop: 4,
          }}
        >
          {preview || "Untitled moment"}
        </Text>
      </View>

      <Pressable
        onPress={handleDiscard}
        hitSlop={10}
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colors.surfaceSecondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}
