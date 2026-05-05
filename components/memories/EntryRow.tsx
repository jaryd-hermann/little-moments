import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (m?.[0] ?? trimmed).trim();
}

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
  /**
   * When true and `entry` is a chapter, render a lock indicator instead of
   * the chevron. The parent owns the actual paywall routing — this prop is
   * just the visual cue. See `ListViewMemories` + `useChapters.isChapterLocked`.
   */
  chapterLocked?: boolean;
}

export function EntryRow({
  entry,
  onOpenChapter,
  chapterLocked = false,
}: EntryRowProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const isChapter = entry.entry_type === "chapter";

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isChapter && entry.chapter_id && onOpenChapter) {
      posthog.capture("opened_chapter_from_capsule", {
        chapter_id: entry.chapter_id,
        locked: chapterLocked,
      });
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
          <Ionicons
            name={chapterLocked ? "lock-closed" : "chevron-forward"}
            size={20}
            color={CHAPTER_MUTED}
          />
        </View>
      </Pressable>
    );
  }

  const firstMedia = entry.media?.[0];
  const isWordEntry = !firstMedia && Boolean(entry.word_of_day);
  const sentence = firstSentence(stripHtml(entry.body));

  return (
    <Pressable
      onPress={handlePress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 4,
      }}
    >
      {firstMedia ? (
        <EntryMediaImage
          media={firstMedia}
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            marginRight: 14,
            backgroundColor: colors.surfaceSecondary,
          }}
        />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            marginRight: 14,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Italic",
              fontSize: 22,
              color: colors.text,
            }}
          >
            {isWordEntry ? "w" : "·"}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        {entry.title ? (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 16,
              color: colors.text,
            }}
            numberOfLines={1}
          >
            {entry.title}
          </Text>
        ) : null}
        {sentence ? (
          <View style={{ position: "relative", marginTop: 2 }}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 13,
                color: colors.textSecondary,
              }}
              numberOfLines={1}
            >
              {sentence}
            </Text>
            <LinearGradient
              colors={[`${colors.background}00`, colors.background]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 70,
              }}
              pointerEvents="none"
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
