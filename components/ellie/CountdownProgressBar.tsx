import { useTheme } from "@/hooks/useTheme";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Text, View } from "react-native";

export interface CountdownProgressBarProps {
  /** Seconds elapsed since the timer started. */
  elapsed: number;
  /** Total duration in seconds (e.g. 60). */
  durationSeconds: number;
  /** Optional override for the bar height. Defaults to 44. */
  height?: number;
}

function formatRemaining(secondsRemaining: number): string {
  const abs = Math.max(0, Math.floor(Math.abs(secondsRemaining)));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  if (m > 0) {
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  return `${s}s`;
}

/**
 * Reference design: rounded teal capsule with a thick white outer border;
 * inner pink fill grows from left to right as the timer elapses. The
 * remaining time is rendered centered over the bar; switches to red
 * "OVERTIME" once the user exceeds the duration.
 */
export function CountdownProgressBar({
  elapsed,
  durationSeconds,
  height = 44,
}: CountdownProgressBarProps) {
  const { colors } = useTheme();
  const progress = Math.min(1, elapsed / durationSeconds);
  const remaining = durationSeconds - elapsed;
  const isOvertime = remaining < 0;

  const widthAnim = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress, widthAnim]);

  const widthInterpolated = useMemo(
    () =>
      widthAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
      }),
    [widthAnim]
  );

  // Brand-consistent: violet/primary fill for elapsed, cream `#FEEEB1`
  // remaining, black stroke. Overtime swaps the fill to red to flag it.
  const trackBg = "#FEEEB1";
  const fillBg = isOvertime ? "#EF4444" : colors.primary;
  const borderColor = colors.text;
  const outerBorderColor = colors.text;

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        borderWidth: 2,
        borderColor: outerBorderColor,
        backgroundColor: trackBg,
        overflow: "hidden",
        justifyContent: "center",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: widthInterpolated,
          backgroundColor: fillBg,
          borderTopRightRadius: height,
          borderBottomRightRadius: height,
          borderRightWidth: 1.5,
          borderRightColor: borderColor,
        }}
      />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 14,
            color: isOvertime ? "#FFFFFF" : "#1A1A1A",
            letterSpacing: 0.4,
          }}
        >
          {isOvertime
            ? `+${formatRemaining(remaining)} OVERTIME`
            : formatRemaining(remaining)}
        </Text>
      </View>
    </View>
  );
}
