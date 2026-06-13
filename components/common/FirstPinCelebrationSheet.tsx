import { useTheme } from "@/hooks/useTheme";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { useAuthStore } from "@/store/authStore";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { usePostHog } from "posthog-react-native";
import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

const ALBUM_HERO = require("@/assets/images/album.png");
/** Intrinsic 928×394, used to keep aspect-correct height inside the sheet. */
const ALBUM_HERO_ASPECT = 928 / 394;

const PILL_FILL = "#FECFB4";
const SHIMMER_WIDTH = 64;
const SHIMMER_LOOP_DELAY_MS = 1400;
const SHIMMER_DURATION_MS = 950;

interface FirstPinCelebrationSheetProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Where this sheet was triggered from — passed to PostHog when the user
   * taps "Save on your print". Defaults to "first_pin".
   */
  source?: string;
}

/**
 * Slide-up celebration sheet that fires the first time a user marks a core memory.
 * Hosted at the (tabs) layout via `FirstPinCelebrationHost` so it stays
 * mounted across tab switches and composer dismissal.
 *
 * Visuals: hero album illustration → headline + subtext → "Got it" CTA →
 * shimmering "Save on your print" upsell that mirrors the global
 * `TryPremiumPill` look. The upsell hides for users who are already paid /
 * trialing (mirrors TryPremiumPill's `hideWhenSubscribed` default).
 */
export function FirstPinCelebrationSheet({
  visible,
  onClose,
  source = "first_pin",
}: FirstPinCelebrationSheetProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const subscriptionStatus = useAuthStore(
    (s) => s.profile?.subscription_status ?? "free"
  );
  const isSubscribedOrTrialing =
    subscriptionStatus === "active" || subscriptionStatus === "trial";

  const handleSavePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    launchPremiumFlow(posthog ?? undefined, source);
  }, [onClose, posthog, source]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0, 0, 0, 0.45)",
        }}
        onPress={onClose}
        accessibilityLabel="Close celebration"
      >
        <Pressable
          // Stop the outer Pressable from receiving the tap and dismissing.
          onPress={() => {}}
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 28,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              marginBottom: 18,
            }}
          />

          <View
            style={{
              width: "100%",
              aspectRatio: ALBUM_HERO_ASPECT,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <Image
              source={ALBUM_HERO}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          </View>

          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              color: colors.text,
              textAlign: "center",
              lineHeight: 30,
              marginTop: 22,
            }}
          >
            You saved your first core memory
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textSecondary,
              textAlign: "center",
              lineHeight: 21,
              marginTop: 10,
              paddingHorizontal: 8,
            }}
          >
            Core memories help with selection for your high-quality annual
            printed album
          </Text>

          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            accessibilityLabel="Got it"
            style={{
              marginTop: 22,
              height: 50,
              borderRadius: 9999,
              backgroundColor: colors.text,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: colors.background,
                letterSpacing: 0.6,
              }}
            >
              Got it
            </Text>
          </Pressable>

          {!isSubscribedOrTrialing && (
            <View style={{ marginTop: 14, alignItems: "center" }}>
              <SaveOnPrintCta onPress={handleSavePress} />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Shimmering pill that mirrors `TryPremiumPill`'s look but with a custom
 * label + onPress so the celebration sheet can route the user to the print /
 * paywall flow without re-using the premium-entry button verbatim.
 *
 * Loops the shimmer as long as the sheet is open — small attention cue that
 * a secondary action exists below the primary "Got it" CTA.
 */
function SaveOnPrintCta({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const [pillWidth, setPillWidth] = useState(0);
  const shimmerX = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w === pillWidth) return;
    setPillWidth(w);
    animRef.current?.stop();
    shimmerX.setValue(-SHIMMER_WIDTH);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: w + SHIMMER_WIDTH,
          duration: SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(SHIMMER_LOOP_DELAY_MS),
        Animated.timing(shimmerX, {
          toValue: -SHIMMER_WIDTH,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    animRef.current = loop;
    loop.start();
  };

  return (
    <View
      style={{
        borderRadius: 9999,
        backgroundColor: PILL_FILL,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 4,
      }}
    >
      <Pressable
        accessibilityLabel="Save on your print"
        onPress={onPress}
        onLayout={handleLayout}
        hitSlop={8}
        style={{
          height: 40,
          paddingHorizontal: 18,
          borderRadius: 9999,
          backgroundColor: PILL_FILL,
          borderWidth: 2,
          borderColor: "#000000",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 12,
            color: "#1A1A1A",
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          Save on your print
        </Text>
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: SHIMMER_WIDTH,
            transform: [{ translateX: shimmerX }, { skewX: "-20deg" }],
          }}
        >
          <LinearGradient
            colors={[
              "rgba(255,255,255,0)",
              "rgba(255,255,255,0.85)",
              "rgba(255,255,255,0)",
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}
