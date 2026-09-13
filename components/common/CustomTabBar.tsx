import { useEffect, useRef } from "react";
import { View, Pressable, Text, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";

type ShapeKind = "circle" | "square" | "diamond" | "triangle";

interface TabItem {
  key: string;
  label: string;
  shape: ShapeKind;
  routeName: string;
  fillColor: string;
}

const TAB_ITEMS: TabItem[] = [
  { key: "capture", label: "CAPTURE", shape: "circle", routeName: "today", fillColor: "#F0D7FF" },
  { key: "capsule", label: "CAPSULE", shape: "square", routeName: "memories", fillColor: "#FFFFEB" },
  { key: "chapters", label: "CHAPTERS", shape: "triangle", routeName: "chapters", fillColor: "#024F46" },
  { key: "brain", label: "CONNECT", shape: "diamond", routeName: "brain", fillColor: "#FECFB4" },
];

interface ShapeIconProps {
  shape: ShapeKind;
  filled: boolean;
  fillColor: string;
  strokeColor: string;
}

function ShapeIcon({ shape, filled, fillColor, strokeColor }: ShapeIconProps) {
  if (shape === "circle") {
    return (
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 9999,
          backgroundColor: filled ? fillColor : "transparent",
          borderWidth: 2,
          borderColor: strokeColor,
        }}
      />
    );
  }
  if (shape === "square") {
    return (
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 4,
          backgroundColor: filled ? fillColor : "transparent",
          borderWidth: 2,
          borderColor: strokeColor,
        }}
      />
    );
  }
  if (shape === "diamond") {
    return (
      <View
        style={{
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: filled ? fillColor : "transparent",
            borderWidth: 2,
            borderColor: strokeColor,
            transform: [{ rotate: "45deg" }],
          }}
        />
      </View>
    );
  }
  // triangle
  return (
    <View
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {filled ? (
        <>
          <Ionicons name="triangle" size={26} color={fillColor} />
          <Ionicons
            name="triangle-outline"
            size={26}
            color={strokeColor}
            style={{ position: "absolute" }}
          />
        </>
      ) : (
        <Ionicons name="triangle-outline" size={26} color={strokeColor} />
      )}
    </View>
  );
}

/**
 * Capsule tab icon — wraps the square ShapeIcon and runs a 3s clockwise
 * rotation + glimmer when the store's pulse trigger increments (after a save).
 */
function CapsuleSquareIcon({
  filled,
  fillColor,
  strokeColor,
}: {
  filled: boolean;
  fillColor: string;
  strokeColor: string;
}) {
  const pulseTrigger = useTabBarStore((s) => s.capsulePulseTrigger);
  const rotate = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const lastSeenTrigger = useRef(pulseTrigger);

  useEffect(() => {
    if (pulseTrigger === lastSeenTrigger.current) return;
    lastSeenTrigger.current = pulseTrigger;

    rotate.setValue(0);
    shimmer.setValue(0);

    Animated.timing(rotate, {
      toValue: 1,
      duration: 3000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.timing(shimmer, {
        toValue: 0,
        duration: 700,
        useNativeDriver: false,
      }),
      Animated.delay(1100),
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.timing(shimmer, {
        toValue: 0,
        duration: 700,
        useNativeDriver: false,
      }),
    ]).start();
  }, [pulseTrigger, rotate, shimmer]);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const bgInterp = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [filled ? fillColor : "transparent", fillColor],
  });
  const borderInterp = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [strokeColor, fillColor],
  });

  return (
    <Animated.View
      style={{
        width: 26,
        height: 26,
        borderRadius: 4,
        backgroundColor: bgInterp,
        borderWidth: 2,
        borderColor: borderInterp,
        transform: [{ rotate: rotateInterp }],
      }}
    />
  );
}

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHidden = useTabBarStore((s) => s.hidden);

  if (tabBarHidden) return null;

  const focusedRouteName = state.routes[state.index]?.name;
  const strokeColor = theme === "dark" ? "#FFFFFF" : "#1A1A1A";
  // Capsule's brand fill is the same beige as the app surface, so it would be
  // invisible when filled in light mode. Swap to ink so the active state still
  // reads as "filled" (a black square) while the brand colour stays in dark
  // mode.
  const capsuleFillColor = theme === "dark" ? "#FFFFEB" : "#1A1A1A";

  return (
    <View
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          paddingTop: 8,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 12,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {TAB_ITEMS.map((item) => {
          const isFocused = focusedRouteName === item.routeName;

          const onPress = () => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
            if (!isFocused) {
              navigation.navigate(item.routeName as never);
            }
          };

          return (
            <View key={item.key} style={{ flex: 1 }}>
              <Pressable
                onPress={onPress}
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 4,
                }}
              >
              {item.key === "capsule" ? (
                <CapsuleSquareIcon
                  filled={isFocused}
                  fillColor={capsuleFillColor}
                  strokeColor={strokeColor}
                />
              ) : (
                <ShapeIcon
                  shape={item.shape}
                  filled={isFocused}
                  fillColor={item.fillColor}
                  strokeColor={strokeColor}
                />
              )}
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: isFocused ? colors.text : colors.textSecondary,
                }}
              >
                {item.label}
              </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
