import { View, Text, Pressable, Image } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import type { Thread } from "@/hooks/useThreads";
import { threadCardHeadlineFromOrdinal } from "@/lib/threadOrdinal";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { Shimmer } from "@/components/common/Shimmer";
import { useUnseenStore } from "@/store/unseenStore";

const ELLIE_AVATAR = require("@/assets/images/tab-compose-plus.png");

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
  const posthog = usePostHog();

  // Cross-screen "viewed in this session" overlay — when the detail screen
  // (mounted in a different hook instance) marks a thread viewed, this set
  // updates and the in-feed shimmer drops without waiting for a refetch.
  const viewedInSession = useUnseenStore((s) =>
    s.viewedThreadIds.has(thread.id)
  );

  // Locked threads can't actually be viewed (tap routes to upgrade), so we
  // exclude them from the "shimmer to draw attention" treatment — otherwise
  // a free user with 11+ threads would see the bottom card pulse forever.
  const isUnseen = thread.viewed_at == null && !viewedInSession && !locked;

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      // Respects the `paywall` PostHog flag: `test` → straight to /paywall
      // (RevenueCat pricing), `control` → /ellie-premium multi-step. Unifies
      // this with every other "Try Premium" entry point in the app.
      launchPremiumFlow(posthog, "thread_card_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
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
    // Outer wrapper paints the white "frame" + hard black bevel. The peach
    // body is nested inside so the white ring is just outer padding, which
    // keeps the inner card edges crisp without any second border.
    <Pressable
      onPress={handlePress}
      style={{
        borderRadius: 22,
        backgroundColor: "#FFFFFF",
        padding: 6,
        shadowColor: "#000000",
        shadowOffset: { width: 4, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 6,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          backgroundColor: "#FECFB4",
          paddingHorizontal: 22,
          paddingTop: 22,
          paddingBottom: 24,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 20,
            color: "#1A1A1A",
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          {displayHeadline}
        </Text>

        {/* Body — Ellie avatar sits inline with the first line of text so the
            whole block stays optically centered. RN supports <Image> inside
            <Text> as long as width/height are explicit. */}
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: "#1A1A1A",
            textAlign: "center",
          }}
        >
          <Image
            source={ELLIE_AVATAR}
            style={{ width: 18, height: 18 }}
            accessibilityLabel="Ellie"
          />
          {"  "}You said something interesting here{"\n"}
          that connects to more of your past moments.
        </Text>

        <Text
          style={{
            fontFamily: "Roboto-Bold",
            fontSize: 15,
            lineHeight: 22,
            color: "#1A1A1A",
            textAlign: "center",
            marginTop: 18,
          }}
        >
          See what I found...
        </Text>

        {locked && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 16,
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

        {isUnseen && <Shimmer active bandWidth={70} intervalMs={1100} />}
      </View>
    </Pressable>
  );
}
