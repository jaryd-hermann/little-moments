import { useEffect, useRef } from "react";
import { View, Pressable, Text, Animated, Easing } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";
import { useUnseenStore } from "@/store/unseenStore";

/** Slow, gentle rotation used by Connect / Chapters icons when content is unseen. */
const UNSEEN_ROTATION_PERIOD_MS = 5200;
/** Glint sweep used by the same attention loop. */
const UNSEEN_SHIMMER_DURATION_MS = 1100;
const UNSEEN_SHIMMER_PAUSE_MS = 1600;
/** Pixel width of the moving shimmer band — kept narrow so the triangle bleed is minimal. */
const UNSEEN_SHIMMER_BAND_PX = 8;

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
 * Animation timing helper shared by the diamond and triangle "attention"
 * variants. Returns the rotation interpolation + the shimmer X translation
 * value, both driven by `active`.
 */
function useAttentionAnimation(active: boolean, hostWidth: number) {
  const rotate = useRef(new Animated.Value(0)).current;
  // Park fully off the left edge so the shimmer never peeks out before the
  // first sweep starts.
  const shimmerX = useRef(
    new Animated.Value(-UNSEEN_SHIMMER_BAND_PX)
  ).current;
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null);
  const shimmerLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active) {
      rotateLoop.current?.stop();
      shimmerLoop.current?.stop();
      rotateLoop.current = null;
      shimmerLoop.current = null;
      Animated.timing(rotate, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      shimmerX.setValue(-UNSEEN_SHIMMER_BAND_PX);
      return;
    }

    rotate.setValue(0);
    shimmerX.setValue(-UNSEEN_SHIMMER_BAND_PX);

    const r = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: UNSEEN_ROTATION_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateLoop.current = r;
    r.start();

    const s = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: hostWidth + UNSEEN_SHIMMER_BAND_PX,
          duration: UNSEEN_SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(UNSEEN_SHIMMER_PAUSE_MS),
        Animated.timing(shimmerX, {
          toValue: -UNSEEN_SHIMMER_BAND_PX,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerLoop.current = s;
    s.start();

    return () => {
      r.stop();
      s.stop();
    };
  }, [active, hostWidth, rotate, shimmerX]);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return { rotateInterp, shimmerX };
}

/**
 * Reusable shimmer band — a vertical column with a soft white glint that
 * the parent's `overflow: hidden` is expected to clip to its visible region.
 * The parent supplies `translateX` so the same component works for the
 * diamond (rotated parent) and the triangle (axis-aligned parent).
 */
function AttentionShimmerBand({
  translateX,
  height,
}: {
  translateX: Animated.Value;
  height: number;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: UNSEEN_SHIMMER_BAND_PX,
        height,
        transform: [{ translateX }],
      }}
    >
      <LinearGradient
        colors={[
          "rgba(255,255,255,0)",
          "rgba(255,255,255,0.95)",
          "rgba(255,255,255,0)",
        ]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/**
 * Diamond (Connect) attention icon. Because the diamond is literally a square
 * rotated 45°, we get *perfect* clipping by putting the shimmer band inside
 * the rotated `View` with `overflow: hidden` — the shimmer is masked to the
 * diamond silhouette, no SVG required.
 */
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
  const { rotateInterp, shimmerX } = useAttentionAnimation(active, SIZE);

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
          overflow: "hidden",
        }}
      >
        {active && (
          <AttentionShimmerBand translateX={shimmerX} height={SIZE} />
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Triangle (Chapters) attention icon. Without an SVG `<ClipPath>` we can't
 * mask a sweeping band to a non-rectangular silhouette — but we can use
 * the triangle's *own geometry* as the clip:
 *
 *   The shimmer is a thin horizontal band that travels apex → base. At
 *   every y its scaleX is interpolated to match the triangle's width at
 *   that y (which is just `(y - apexY) / (baseY - apexY)`). Because the
 *   band is centered on the triangle's vertical axis, its left and right
 *   edges trace the triangle's left and right edges as it descends —
 *   never extending into the empty corners around the triangle.
 *
 * The result is a glint that scans down through the interior of the
 * triangle, perfectly clipped, with zero bleed into the bounding box.
 */
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
  // Approximate Ionicons "triangle"/"triangle-outline" silhouette in 28x28.
  // Slightly conservative bounds keep the band inset from the visible
  // outline so font-rendering jitter never produces a visible bleed.
  const APEX_Y = 3;
  const BASE_Y = 24;
  const BASE_WIDTH = 22;
  const BAND_HEIGHT = 3;

  const rotate = useRef(new Animated.Value(0)).current;
  // 0 = band parked above the apex (invisible), 1 = band at base (full width).
  const progress = useRef(new Animated.Value(0)).current;
  const rotateLoop = useRef<Animated.CompositeAnimation | null>(null);
  const sweepLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active) {
      rotateLoop.current?.stop();
      sweepLoop.current?.stop();
      rotateLoop.current = null;
      sweepLoop.current = null;
      Animated.timing(rotate, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      progress.setValue(0);
      return;
    }

    rotate.setValue(0);
    progress.setValue(0);

    const r = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: UNSEEN_ROTATION_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateLoop.current = r;
    r.start();

    const s = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: UNSEEN_SHIMMER_DURATION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(UNSEEN_SHIMMER_PAUSE_MS),
        // Snap back instantly — at progress=0, scaleX=0 so the snap is
        // invisible.
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );
    sweepLoop.current = s;
    s.start();

    return () => {
      r.stop();
      s.stop();
    };
  }, [active, rotate, progress]);

  const rotateInterp = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [APEX_Y, BASE_Y - BAND_HEIGHT],
  });
  // scaleX matches the triangle's normalized width at the current y, so the
  // band's left and right edges always sit exactly on the triangle's edges.
  const scaleX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

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

      {active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: (SIZE - BASE_WIDTH) / 2,
            width: BASE_WIDTH,
            height: BAND_HEIGHT,
            transform: [{ translateY }, { scaleX }],
          }}
        >
          <LinearGradient
            colors={[
              "rgba(255,255,255,0)",
              "rgba(255,255,255,0.95)",
              "rgba(255,255,255,0)",
            ]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
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

          // Connect (diamond) shimmers + rotates while there is an unseen
          // thread; same pattern for Chapters (triangle). The animation
          // stops the moment the count drops to zero (handled inside
          // AttentionIcon via the `active` prop). Dev-mode force flags from
          // Settings also flip the animation on regardless of real counts.
          const attentionActive =
            (item.key === "brain" &&
              (unseenThreadCount > 0 || forceUnseenThread)) ||
            (item.key === "chapters" &&
              (unseenChapterCount > 0 || forceUnseenChapter));

          return (
            <Pressable
              key={item.key}
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
          );
        })}
      </View>
    </View>
  );
}
