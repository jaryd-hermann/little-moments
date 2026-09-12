import { useEffect, useRef } from "react";
import { View, Pressable, Text, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";
import { useUnseenStore } from "@/store/unseenStore";

/** Slow, gentle rotation used by Connect / Chapters icons when content is unseen. */
const UNSEEN_ROTATION_PERIOD_MS = 9000;

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
 * Rotation driver shared by the diamond and triangle "attention" variants.
 */
function useAttentionAnimation(active: boolean) {
  const rotate = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active) {
      rotateLoop.current?.stop();
      rotateLoop.current = null;
      Animated.timing(rotate, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return;
    }

    rotate.setValue(0);

    const r = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: UNSEEN_ROTATION_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
        // Decorative loop: must not hold an InteractionManager handle, or
        // deferred work queued elsewhere stutters the spin.
        isInteraction: false,
      })
    );
    rotateLoop.current = r;
    r.start();

    return () => r.stop();
  }, [active, rotate]);

  return rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
}

/** Diamond (Connect) attention icon — a square rotated 45°, spun while unseen. */
function DiamondAttentionIcon({
  active,
  filled,
  fillColor,
  strokeColor,
}: {
  active: boolean;
  filled: boolean;
  fillColor: string;
  strokeColor: string;
}) {
  const SIZE = 20;
  const rotateInterp = useAttentionAnimation(active);

  return (
    <Animated.View
      style={{
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ rotate: rotateInterp }],
      }}
    >
      <View
        style={{
          width: SIZE,
          height: SIZE,
          backgroundColor: filled ? fillColor : "transparent",
          borderWidth: 2,
          borderColor: strokeColor,
          transform: [{ rotate: "45deg" }],
        }}
      />
    </Animated.View>
  );
}

/** Triangle (Chapters) attention icon — spun while there is unseen activity. */
function TriangleAttentionIcon({
  active,
  filled,
  fillColor,
  strokeColor,
}: {
  active: boolean;
  filled: boolean;
  fillColor: string;
  strokeColor: string;
}) {
  const SIZE = 28;
  const rotateInterp = useAttentionAnimation(active);

  return (
    <Animated.View
      style={{
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ rotate: rotateInterp }],
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
    </Animated.View>
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
  const unseenThreadCount = useUnseenStore((s) => s.unseenThreadCount);
  const unseenChapterCount = useUnseenStore((s) => s.unseenChapterCount);
  const forceUnseenThread = useUnseenStore((s) => s.forceUnseenThreadAttention);
  const forceUnseenChapter = useUnseenStore(
    (s) => s.forceUnseenChapterAttention
  );
  const threadsSeenAtCount = useUnseenStore((s) => s.threadsSeenAtCount);
  const chaptersSeenAtCount = useUnseenStore((s) => s.chaptersSeenAtCount);

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

          // Connect (diamond) rotates while there is an unseen thread the user
          // hasn't been shown yet; same pattern for Chapters (triangle).
          // Comparing against the seen mark — not zero — is what lets simply
          // visiting the tab stop the spin. Dev-mode force flags from Settings
          // flip the animation on regardless of real counts.
          const attentionActive =
            (item.key === "brain" &&
              (unseenThreadCount > threadsSeenAtCount || forceUnseenThread)) ||
            (item.key === "chapters" &&
              (unseenChapterCount > chaptersSeenAtCount ||
                forceUnseenChapter));

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
              ) : item.key === "brain" ? (
                <DiamondAttentionIcon
                  active={attentionActive}
                  filled={isFocused}
                  fillColor={item.fillColor}
                  strokeColor={strokeColor}
                />
              ) : item.key === "chapters" ? (
                <TriangleAttentionIcon
                  active={attentionActive}
                  filled={isFocused}
                  fillColor={item.fillColor}
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
