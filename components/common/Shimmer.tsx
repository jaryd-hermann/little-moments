import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const DEFAULT_GRADIENT: readonly [string, string, string] = [
  "rgba(255,255,255,0)",
  "rgba(255,255,255,0.85)",
  "rgba(255,255,255,0)",
];

interface ShimmerProps {
  /** When false the animation is paused — use to stop the loop without unmounting. */
  active?: boolean;
  /** Width of the diagonal sweep band, in px. Default 56. */
  bandWidth?: number;
  /** One full sweep across the host. Default 1100ms. */
  durationMs?: number;
  /** Pause between sweeps. Default 1400ms. */
  intervalMs?: number;
  /** Gradient stops — keep the middle stop opaque-ish for a visible glint. */
  colors?: readonly [string, string, string];
  /**
   * Shape of the bevel: a `-20deg` skew matches the Try Premium pill / splash CTA
   * shimmer. Set to `0` for an axis-aligned glint (better on tiny icons).
   */
  skewDeg?: number;
  /** Optional style applied to the host wrapper (matches the parent's bounds by default). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Constant-loop shimmer overlay. Drop inside any `position: relative` host with
 * `overflow: hidden`; the gradient sweeps across the host's measured width on
 * an infinite loop while `active` is true.
 *
 * Stops cleanly on unmount or when `active` flips to false — no leaked
 * `Animated.loop` callbacks.
 */
export function Shimmer({
  active = true,
  bandWidth = 56,
  durationMs = 1100,
  intervalMs = 1400,
  colors = DEFAULT_GRADIENT,
  skewDeg = -20,
  style,
}: ShimmerProps) {
  const [hostWidth, setHostWidth] = useState(0);
  const translateX = useRef(new Animated.Value(-bandWidth)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!active || hostWidth <= 0) {
      animRef.current?.stop();
      animRef.current = null;
      translateX.setValue(-bandWidth);
      return;
    }

    translateX.setValue(-bandWidth);
    const sequence = Animated.sequence([
      Animated.timing(translateX, {
        toValue: hostWidth + bandWidth,
        duration: durationMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(intervalMs),
      Animated.timing(translateX, {
        toValue: -bandWidth,
        duration: 0,
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(sequence);
    animRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      animRef.current = null;
    };
  }, [active, hostWidth, bandWidth, durationMs, intervalMs, translateX]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== hostWidth) setHostWidth(w);
  };

  return (
    <View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[StyleSheet.absoluteFill, style]}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: bandWidth,
          transform: skewDeg
            ? [{ translateX }, { skewX: `${skewDeg}deg` }]
            : [{ translateX }],
        }}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}
