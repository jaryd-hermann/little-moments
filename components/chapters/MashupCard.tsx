import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { useTheme } from "@/hooks/useTheme";
import type { MashupBucket, MashupClip } from "@/lib/mashupBuckets";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface MashupCardProps {
  bucket: MashupBucket;
  width: number;
  height: number;
  onPress: (bucket: MashupBucket) => void;
  onShare?: (bucket: MashupBucket) => void;
}

/**
 * Static cover for a mashup — the movie's first piece of media.
 *
 * Deliberately a plain image: cycling through clips or mounting a clip player
 * here meant every card on the Movies list span up a video player / live-photo
 * session before the user had asked for anything.
 */
function MashupCoverStill({ clips }: { clips: MashupClip[] }) {
  const clip = clips[0];
  if (!clip) return <View style={StyleSheet.absoluteFill} />;

  return (
    <EntryMediaImage
      media={clip.media}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      recyclingKey={`mashup-cover-${clip.media.id}`}
    />
  );
}

export function MashupCard({
  bucket,
  width,
  height,
  onPress,
  onShare,
}: MashupCardProps) {
  const { colors, theme } = useTheme();

  const openMashup = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress(bucket);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${bucket.label} mashup, ${bucket.count} moment${
        bucket.count === 1 ? "" : "s"
      }`}
      onPress={openMashup}
      style={{
        width,
        height,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: colors.surfaceSecondary,
        borderWidth: 2,
        borderColor: colors.text,
      }}
    >
      <MashupCoverStill clips={bucket.clips} />

      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
        start={{ x: 0.5, y: 0.4 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "55%",
        }}
        pointerEvents="none"
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 18,
          right: 72,
          bottom: 22,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 34,
            lineHeight: 38,
            color: "#FFFFFF",
            textShadowColor: "rgba(0,0,0,0.55)",
            textShadowOffset: { width: 0, height: 2 },
            textShadowRadius: 6,
          }}
        >
          {bucket.label}
        </Text>
        <View
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 9999,
            backgroundColor: "rgba(0,0,0,0.55)",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 12,
              color: "#FFFFFF",
            }}
          >
            {bucket.count} Moment{bucket.count === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      {/* Play — same action as tapping the card. */}
      <Pressable
        accessibilityLabel="Play mashup"
        hitSlop={10}
        onPress={(e) => {
          e.stopPropagation?.();
          openMashup();
        }}
        style={[
          {
            position: "absolute",
            bottom: 20,
            right: 16,
            width: 46,
            height: 46,
            borderRadius: 23,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
          },
          bevelShadow(theme),
        ]}
      >
        <Ionicons
          name="play"
          size={20}
          color={PINK_CTA_INK}
          style={{ marginLeft: 2 }}
        />
      </Pressable>

      {onShare ? (
        <Pressable
          accessibilityLabel="Share mashup"
          hitSlop={12}
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onShare(bucket);
          }}
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="share-outline" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}
