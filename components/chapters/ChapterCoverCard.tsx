import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { Shimmer } from "@/components/common/Shimmer";
import { useTheme } from "@/hooks/useTheme";
import {
  chapterImageSlideToMedia,
  chapterWeekLabel,
  type ChapterRecord,
} from "@/lib/chapters";
import { useUnseenStore } from "@/store/unseenStore";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text, View } from "react-native";

export function ChapterCoverShimmer({
  chapterId,
  viewedAt,
}: {
  chapterId: string;
  viewedAt: string | null;
}) {
  const viewedInSession = useUnseenStore((s) =>
    s.viewedChapterIds.has(chapterId)
  );
  if (viewedAt != null || viewedInSession) return null;
  return <Shimmer active bandWidth={120} intervalMs={1300} />;
}

export function ChapterLockedOverlay() {
  const { colors, theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 18,
        backgroundColor:
          theme === "dark" ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.92)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Ionicons name="lock-closed" size={22} color={colors.primary} />
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 18,
            color: colors.primary,
          }}
        >
          Chapter locked
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 20,
          color: colors.text,
          textAlign: "center",
        }}
      >
        Upgrade to unlock this chapter.
      </Text>
    </View>
  );
}

function CollageGrid({
  media,
}: {
  media: ReturnType<typeof chapterImageSlideToMedia>;
}) {
  if (media.length === 0) {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#222222",
        }}
      />
    );
  }

  type Row = (typeof media)[number][];
  const rows: Row[] = [];
  let idx = 0;
  if (media.length % 2 === 1) {
    rows.push([media[idx++]]);
  }
  while (idx < media.length) {
    rows.push([media[idx], media[idx + 1]]);
    idx += 2;
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "column",
      }}
    >
      {rows.map((row, ri) => (
        <View key={ri} style={{ flex: 1, flexDirection: "row" }}>
          {row.map((m, ci) => (
            <View key={`${ri}-${ci}`} style={{ flex: 1, overflow: "hidden" }}>
              <EntryMediaImage
                media={m}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function ChapterCoverCard({ chapter }: { chapter: ChapterRecord }) {
  const label = chapterWeekLabel(chapter);
  const collageMedia = chapter.image_slide
    ? chapterImageSlideToMedia(chapter.image_slide)
    : [];

  return (
    <>
      <CollageGrid media={collageMedia} />

      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
        start={{ x: 0.5, y: 0.4 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "60%",
        }}
        pointerEvents="none"
      />

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 28,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: "rgba(255,255,255,0.78)",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Chapter {chapter.chapter_number}
        </Text>
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 28,
            lineHeight: 34,
            color: "#FFFFFF",
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          {chapter.moment_count} moments captured
        </Text>
      </View>
    </>
  );
}
