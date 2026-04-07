import { View, Text, Pressable, Image } from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { Thread } from "@/hooks/useThreads";
import { threadCardHeadlineFromOrdinal } from "@/lib/threadOrdinal";

const THREAD_CARD_BG = "#FECFB4";
const THREAD_CORNER_ART = require("@/assets/images/thread.png");
const ELLIE_AVATAR = require("@/assets/images/tab-compose-plus.png");
const INSIGHT_BUTTON_FILL = "#F0D7FF";

/** Single layout (matches Today / Capsule compact card). */
const CORNER = 118;
const PAD = 16;
const PAD_BOTTOM = 68;

interface ThreadCardProps {
  thread: Thread;
  locked?: boolean;
  /** @deprecated Layout is unified; kept for call-site compatibility. */
  variant?: "full" | "compact";
  /**
   * Today tab copy, e.g. "1 New Thread found".
   * When omitted, headline uses `ordinalRank` → "Nth Thread found".
   */
  headline?: string;
  /** 1-based among user threads (oldest = 1). Ignored if `headline` is set. */
  ordinalRank?: number;
}

export function ThreadCard({
  thread,
  locked = false,
  headline,
  ordinalRank,
}: ThreadCardProps) {
  const { colors, theme } = useTheme();

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      router.push("/paywall/upgrade");
      return;
    }
    router.push(`/threads/${thread.id}`);
  };

  const displayHeadline =
    headline ??
    (ordinalRank != null
      ? threadCardHeadlineFromOrdinal(ordinalRank)
      : "1 New Thread found");

  return (
    <Pressable
      onPress={handlePress}
      style={{
        borderRadius: 20,
        backgroundColor: THREAD_CARD_BG,
        padding: PAD,
        paddingBottom: PAD_BOTTOM,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 17,
          color: "#1A1A1A",
          textAlign: "center",
          marginBottom: 14,
        }}
      >
        {displayHeadline}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          paddingRight: CORNER - 20,
        }}
      >
        <Image
          source={ELLIE_AVATAR}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            marginTop: 2,
          }}
          accessibilityLabel="Ellie"
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: "#1A1A1A",
              lineHeight: 22,
            }}
          >
            You said something interesting here that connects to more of your
            past moments.
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Bold",
              fontSize: 14,
              color: "#1A1A1A",
              marginTop: 10,
              lineHeight: 22,
            }}
          >
            Want to see what I found?
          </Text>
          <View
            style={{
              alignSelf: "flex-start",
              marginTop: 12,
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 999,
              backgroundColor: INSIGHT_BUTTON_FILL,
              borderWidth: 2,
              borderColor: "#000000",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: "#1A1A1A",
              }}
            >
              See my insight
            </Text>
          </View>
        </View>
      </View>

      <ExpoImage
        source={THREAD_CORNER_ART}
        style={{
          position: "absolute",
          right: 4,
          bottom: 4,
          width: CORNER,
          height: CORNER,
        }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
      />

      {locked && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 20,
            backgroundColor:
              theme === "dark"
                ? "rgba(0,0,0,0.75)"
                : "rgba(255,255,255,0.88)",
            justifyContent: "center",
            alignItems: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.primary,
                textAlign: "center",
              }}
            >
              Upgrade to see what Ellie found
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
