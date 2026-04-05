import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { format } from "date-fns";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

const CHAPTER_BG = "#024F46";
const CHAPTER_BORDER = "#FFFFEB";
const CHAPTER_TEXT = "#FFFFEB";
const CHAPTER_MUTED = "rgba(255,255,235,0.7)";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

interface EntryRowProps {
  entry: Entry;
  onOpenChapter?: (chapterId: string) => void;
}

export function EntryRow({ entry, onOpenChapter }: EntryRowProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const isChapter = entry.entry_type === "chapter";

  const handlePress = () => {
    if (isChapter && entry.chapter_id && onOpenChapter) {
      posthog.capture("opened_chapter_from_capsule", { chapter_id: entry.chapter_id });
      onOpenChapter(entry.chapter_id);
    } else {
      posthog.capture("capsule_entry_opened", { entry_id: entry.id, entry_type: entry.entry_type });
      router.push(`/entry/${entry.id}`);
    }
  };

  if (isChapter) {
    const plainBody = stripHtml(entry.body);
    return (
      <Pressable
        onPress={handlePress}
        style={{
          borderRadius: 16,
          borderWidth: 3,
          borderColor: CHAPTER_BORDER,
          backgroundColor: CHAPTER_BG,
          padding: 20,
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
              color: CHAPTER_TEXT,
            }}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              color: CHAPTER_MUTED,
              marginTop: 6,
              lineHeight: 19,
            }}
            numberOfLines={2}
          >
            {plainBody}
          </Text>
        </View>
        <View style={{ marginLeft: 12 }}>
          <Ionicons name="chevron-forward" size={20} color={CHAPTER_MUTED} />
        </View>
      </Pressable>
    );
  }

  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "MMM d")
    : entry.entry_month
      ? `${entry.entry_month}/${entry.entry_year}`
      : `${entry.entry_year}`;

  const firstMedia = entry.media?.[0];
  const plainBody = stripHtml(entry.body);
  const bodyPreview =
    plainBody.length > 80
      ? plainBody.slice(0, 80) + "..."
      : plainBody;

  return (
    <Pressable
      onPress={handlePress}
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        {entry.title && (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 15,
              color: colors.text,
            }}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
        )}
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textSecondary,
            marginTop: 2,
            lineHeight: 18,
          }}
          numberOfLines={2}
        >
          {bodyPreview}
        </Text>
      </View>

      {firstMedia && (
        <EntryMediaImage
          media={firstMedia}
          style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            marginLeft: 10,
            marginRight: 10,
            backgroundColor: colors.surfaceSecondary,
          }}
        />
      )}

      <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
          }}
        >
          {dateStr}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={colors.tabIconDefault}
          style={{ marginTop: 4 }}
        />
      </View>
    </Pressable>
  );
}
