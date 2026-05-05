import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ChapterRecord } from "@/lib/chapters";
import { chapterCardTitle, chapterWeekLabel, chapterMonthName } from "@/lib/chapters";

const CARD_BG = "#024F46";
const CARD_BORDER = "#FFFFEB";
const CARD_TEXT = "#FFFFEB";
const CARD_MUTED = "rgba(255,255,235,0.7)";

interface ChapterCardProps {
  chapter: ChapterRecord;
  onPress: () => void;
}

export function ChapterCard({ chapter, onPress }: ChapterCardProps) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        borderRadius: 16,
        borderWidth: 3,
        borderColor: CARD_BORDER,
        backgroundColor: CARD_BG,
        padding: 20,
      }}
    >
      <View
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#FFFFFF",
          borderRadius: 9999,
          paddingHorizontal: 12,
          paddingVertical: 4,
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: "#1A1A1A",
            letterSpacing: 0.3,
          }}
        >
          Watch your new chapter!
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 15,
              color: CARD_TEXT,
            }}
          >
            {chapterCardTitle(chapter)}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              color: CARD_MUTED,
              marginTop: 6,
              lineHeight: 19,
            }}
          >
            {chapter.moment_count} moments woven into your{" "}
            {chapter.ref_week_start_date
              ? chapterWeekLabel(chapter)
              : chapter.ref_month != null
                ? `${chapterMonthName(chapter.ref_month)} story`
                : "story"}
            .
          </Text>
        </View>
        <View style={{ marginLeft: 12 }}>
          <Ionicons name="chevron-forward" size={20} color={CARD_MUTED} />
        </View>
      </View>
    </Pressable>
  );
}
