import { useMemo } from "react";
import { View, Text } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { Thread, ThreadEntry } from "@/hooks/useThreads";
import {
  connectionLabel,
  ordinalWord,
} from "@/lib/threadOrdinal";
import { Shimmer } from "@/components/common/Shimmer";
import { useUnseenStore } from "@/store/unseenStore";

const PEACH_BG = "#FECFB4";
const DARK_BAND = "#0F0F0F";
const TITLE_TINT = "#FECFB4";

function isUsableImage(m: NonNullable<ThreadEntry["media"]>[number]): boolean {
  return (
    !!m.storage_url &&
    (m.media_type ?? "").toLowerCase().startsWith("image")
  );
}

function entryImages(entry: ThreadEntry | null | undefined): string[] {
  return (entry?.media ?? [])
    .filter(isUsableImage)
    .map((m) => m.storage_url!) as string[];
}

/**
 * Bucket the combined image count to one of the four supported layouts:
 * 0, 2, 4, or 6 (even only). If either side of the connection has no image,
 * we fall back to the no-image layout — a thread is the bridge between two
 * moments, so showing only one side's photos would misread the visual.
 */
function bucketCount(aCount: number, bCount: number): 0 | 2 | 4 | 6 {
  if (aCount === 0 || bCount === 0) return 0;
  const total = aCount + bCount;
  const even = total - (total % 2);
  return Math.min(6, even) as 2 | 4 | 6;
}

/**
 * Strip the small set of markdown tokens our LLM observations actually emit.
 * Cheap, allocation-light replacements; we do NOT try to be a full markdown
 * parser since the card only renders a 2-line preview.
 */
function stripMarkdown(input: string): string {
  if (!input) return "";
  return input
    .replace(/```[\s\S]*?```/g, "") // fenced code
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1") // bold-italic
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/__(.+?)__/g, "$1") // bold (alt)
    .replace(/(?<!\*)\*(?!\s)([^*]+?)\*(?!\*)/g, "$1") // italic
    .replace(/(?<!_)_(?!\s)([^_]+?)_(?!_)/g, "$1") // italic (alt)
    .replace(/~~(.+?)~~/g, "$1") // strikethrough
    .replace(/^>\s?/gm, "") // blockquote markers
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/\s+/g, " ")
    .trim();
}

interface ThreadFlipCardProps {
  thread: Thread;
  /** 1-indexed position among all the user's threads (oldest = 1). */
  ordinalRank: number;
  locked?: boolean;
}

/**
 * The flipbook card itself. Rendered inside ThreadFlipbookView, which owns
 * gestures + animations. Layout is consistent across all image-count
 * variants: top media row, dark band carrying the ordinal, bottom media row
 * with the connection-type label + observation overlaid bottom-left.
 */
export function ThreadFlipCard({
  thread,
  ordinalRank,
  locked = false,
}: ThreadFlipCardProps) {
  const { colors, theme } = useTheme();

  const viewedInSession = useUnseenStore((s) =>
    s.viewedThreadIds.has(thread.id)
  );
  const isUnseen = thread.viewed_at == null && !viewedInSession && !locked;

  const aImages = useMemo(() => entryImages(thread.entry_a), [thread.entry_a]);
  const bImages = useMemo(() => entryImages(thread.entry_b), [thread.entry_b]);
  const bucket = bucketCount(aImages.length, bImages.length);
  const perRow = bucket / 2; // 0, 1, 2, or 3

  // Split images into top + bottom rows. We slice from each entry up to
  // `perRow`, then pad if either side is short. This keeps the row counts
  // matched without ever showing the same image twice.
  const { topUris, bottomUris } = useMemo(() => {
    if (perRow === 0) return { topUris: [], bottomUris: [] };
    const top: string[] = [];
    const bottom: string[] = [];
    for (let i = 0; i < perRow; i++) {
      if (aImages[i]) top.push(aImages[i]!);
      if (bImages[i]) bottom.push(bImages[i]!);
    }
    // Pad short rows from the other side's leftovers (rare — only happens
    // when one entry has more images than the other).
    let aSpill = aImages.slice(perRow);
    let bSpill = bImages.slice(perRow);
    while (top.length < perRow && bSpill.length > 0) top.push(bSpill.shift()!);
    while (bottom.length < perRow && aSpill.length > 0) {
      bottom.push(aSpill.shift()!);
    }
    return { topUris: top, bottomUris: bottom };
  }, [aImages, bImages, perRow]);

  const ordinalText = `${ordinalWord(ordinalRank)} Thread`;
  const typeText = connectionLabel(thread.connection_type);
  const preview = stripMarkdown(thread.ellie_observation ?? "");

  const hasImages = bucket > 0;
  // Bottom-left text needs to flip to dark on the peach (no-image) variant.
  const bottomTextColor = hasImages ? "#FFFFFF" : "#1A1A1A";

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 22,
        overflow: "hidden",
        backgroundColor: PEACH_BG,
      }}
    >
      {/* Top half */}
      <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
        {hasImages ? (
          topUris.map((uri, i) => (
            <ExpoImage
              key={`top-${i}`}
              source={{ uri }}
              style={{ flex: 1 }}
              contentFit="cover"
            />
          ))
        ) : (
          <View style={{ flex: 1, backgroundColor: PEACH_BG }} />
        )}
        {/* Fade the bottom of the top section into the dark band so the
            surface visually bleeds into the ordinal stripe rather than
            hard-cutting. Applied to both photo rows AND the peach (no-image)
            variant so the card rhythm stays consistent across all buckets. */}
        <LinearGradient
          colors={["rgba(15,15,15,0)", DARK_BAND]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "55%",
          }}
          pointerEvents="none"
        />
      </View>

      {/* Middle dark band — carries the "Nth Thread" ordinal in peach */}
      <View
        style={{
          backgroundColor: DARK_BAND,
          paddingVertical: 18,
          paddingHorizontal: 20,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            lineHeight: 32,
            color: TITLE_TINT,
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {ordinalText}
        </Text>
      </View>

      {/* Bottom half */}
      <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
        {hasImages ? (
          bottomUris.map((uri, i) => (
            <ExpoImage
              key={`bot-${i}`}
              source={{ uri }}
              style={{ flex: 1 }}
              contentFit="cover"
            />
          ))
        ) : (
          <View style={{ flex: 1, backgroundColor: PEACH_BG }} />
        )}
        {/* Mirror of the top-section fade — the dark band dissolves down
            into the bottom surface so both edges feel continuous with the
            stripe (applies to peach + photo variants alike). */}
        <LinearGradient
          colors={[DARK_BAND, "rgba(15,15,15,0)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: "55%",
          }}
          pointerEvents="none"
        />
      </View>

      {/* Legibility gradient — only when there's an image behind the text */}
      {hasImages ? (
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "32%",
          }}
          pointerEvents="none"
        />
      ) : null}

      {/* Bottom-left text block — type label above the fading 2-line preview.
          Same vertical position regardless of image-count bucket so the card
          rhythm stays constant as users flip through. */}
      <View
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 28,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 22,
            lineHeight: 28,
            color: bottomTextColor,
            marginBottom: 6,
          }}
          numberOfLines={1}
        >
          {typeText}
        </Text>
        {preview ? (
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 20,
              color: hasImages
                ? "rgba(255,255,255,0.92)"
                : "rgba(26,26,26,0.85)",
            }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {preview}
          </Text>
        ) : null}
      </View>

      {locked ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 22,
            backgroundColor:
              theme === "dark"
                ? "rgba(0,0,0,0.78)"
                : "rgba(255,255,255,0.88)",
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
            }}
          >
            <Ionicons name="lock-closed" size={20} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 16,
                color: colors.primary,
                textAlign: "center",
              }}
            >
              Upgrade to see what Ellie found
            </Text>
          </View>
        </View>
      ) : null}

      {isUnseen ? <Shimmer active bandWidth={90} intervalMs={1300} /> : null}
    </View>
  );
}
