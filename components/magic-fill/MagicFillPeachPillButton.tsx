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
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

const PILL_FILL = "#FECFB4";
const SHIMMER_WIDTH = 56;
const SHIMMER_DELAY_MS = 600;
const SHIMMER_DURATION_MS = 900;

type MagicFillPeachPillButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  fullWidth?: boolean;
  size?: "default" | "large";
};

/** Matches {@link TryPremiumPill} chrome — peach fill, black stroke, shimmer. */
export function MagicFillPeachPillButton({
  label,
  onPress,
  style,
  accessibilityLabel,
  fullWidth = false,
  size = "default",
}: MagicFillPeachPillButtonProps) {
  const { colors } = useTheme();
  const [pillWidth, setPillWidth] = useState(0);
  const shimmerX = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;

  useFocusEffect(
    useCallback(() => {
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
    }, [pillWidth, shimmerX])
  );

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== pillWidth) setPillWidth(w);
  };

  const isLarge = size === "large";

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
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      <Pressable
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={handlePress}
        onLayout={handleLayout}
        hitSlop={8}
        style={{
          minHeight: isLarge ? 44 : 40,
          paddingHorizontal: 16,
          paddingVertical: isLarge ? 11 : 0,
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
            fontSize: isLarge ? 14 : 12,
            color: "#1A1A1A",
            letterSpacing: isLarge ? 0.4 : 0.6,
            textTransform: isLarge ? "none" : "uppercase",
          }}
        >
          {label}
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
