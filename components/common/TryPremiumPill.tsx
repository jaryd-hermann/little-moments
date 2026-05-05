import { useCallback, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { usePostHog, useFeatureFlag } from "posthog-react-native";
import { router, useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import {
  PREMIUM_ENTRY_FLAG_KEY,
  premiumRouteFor,
  resolvePremiumEntryVariant,
} from "@/lib/premiumFlow";

const PILL_FILL = "#FECFB4";
const SHIMMER_WIDTH = 56;
const SHIMMER_DELAY_MS = 600;
const SHIMMER_DURATION_MS = 900;

type TryPremiumPillProps = {
  /** Where this pill is mounted (e.g. "today_header", "chapters_header"). */
  source: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Hide for users who already have an active subscription or are mid-trial.
   * Default: true. The pill only shows to `free | expired | cancelled` users.
   */
  hideWhenSubscribed?: boolean;
};

/**
 * Compact "Try Premium" pill that mirrors the splash "Continue" CTA effect at
 * header scale. Fires a one-shot shimmer sweep each time its host screen is
 * focused, to draw the eye on first paint.
 *
 * Routes via the `paywall` PostHog feature flag — `control` runs the existing
 * Ellie chat → upgrade → cause → pricing funnel; `test` jumps straight to the
 * RevenueCat pricing screen.
 */
export function TryPremiumPill({
  source,
  style,
  hideWhenSubscribed = true,
}: TryPremiumPillProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const profile = useAuthStore((s) => s.profile);
  const rawFlag = useFeatureFlag(PREMIUM_ENTRY_FLAG_KEY);
  const variant = resolvePremiumEntryVariant(
    typeof rawFlag === "string" || typeof rawFlag === "boolean"
      ? rawFlag
      : undefined
  );

  const [pillWidth, setPillWidth] = useState(0);
  const shimmerX = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;

  const isSubscribedOrTrialing =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trial";

  /**
   * Re-trigger the shimmer each time the host screen gains focus, but only
   * once per focus. Cancelling the animation on blur prevents leaks.
   */
  useFocusEffect(
    useCallback(() => {
      if (hideWhenSubscribed && isSubscribedOrTrialing) return;
      if (pillWidth <= 0) return;
      shimmerX.setValue(-SHIMMER_WIDTH);
      const anim = Animated.sequence([
        Animated.delay(SHIMMER_DELAY_MS),
        Animated.timing(shimmerX, {
          toValue: pillWidth + SHIMMER_WIDTH,
          duration: SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]);
      anim.start();
      return () => anim.stop();
    }, [hideWhenSubscribed, isSubscribedOrTrialing, pillWidth, shimmerX])
  );

  if (hideWhenSubscribed && isSubscribedOrTrialing) return null;

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog?.capture("premium_entry_tapped", {
      source,
      variant,
    });
    router.push(premiumRouteFor(variant) as never);
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== pillWidth) setPillWidth(w);
  };

  return (
    <View
      style={[
        {
          borderRadius: 9999,
          backgroundColor: PILL_FILL,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 4,
        },
        style,
      ]}
    >
      <Pressable
        accessibilityLabel="Try Premium"
        onPress={handlePress}
        onLayout={handleLayout}
        hitSlop={8}
        style={{
          height: 36,
          paddingHorizontal: 14,
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
          Try Premium
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
