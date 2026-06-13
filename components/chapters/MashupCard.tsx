import { MashupClipPlayer } from "@/components/chapters/MashupClipPlayer";
import { useTheme } from "@/hooks/useTheme";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Pressable, Text, View } from "react-native";

export interface MashupCardProps {
  bucket: MashupBucket;
  width: number;
  height: number;
  isActive: boolean;
  onPress: (bucket: MashupBucket) => void;
  onShare?: (bucket: MashupBucket) => void;
}

export function MashupCard({
  bucket,
  width,
  height,
  isActive,
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
      <MashupClipPlayer
        clips={bucket.clips.slice(0, 1)}
        isActive={isActive}
        loop
        crossfade={false}
        forceStill={!isActive}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />

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
