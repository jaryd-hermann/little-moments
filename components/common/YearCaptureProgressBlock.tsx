import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";

const BG = "#024F46";
const ACCENT = "#F0D7FF";
const STROKE = "#000000";

export interface YearCaptureProgressBlockProps {
  year: number;
  /** 0–1 */
  progress: number;
}

/** Whole minutes until local midnight — how long is left to capture today. */
function minutesLeftToCapture(): number {
  const now = Date.now();
  const d = new Date(now);
  const endOfDay = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
    0,
    0,
    0,
    0
  ).getTime();
  return Math.max(1, Math.ceil(Math.max(0, endOfDay - now) / (1000 * 60)));
}

/**
 * Contained year-capture progress card — title above, thick bar, time-left
 * caption below for clearer accessibility.
 *
 * The "minutes left today" countdown ticks internally (per-minute) so it never
 * forces the parent Capture screen to re-render.
 */
export function YearCaptureProgressBlock({
  year,
  progress,
}: YearCaptureProgressBlockProps) {
  const [minutesLeft, setMinutesLeft] = useState(() => minutesLeftToCapture());
  useEffect(() => {
    // Re-check every 30s so the displayed minute stays accurate without a
    // wasteful per-second timer.
    const id = setInterval(() => setMinutesLeft(minutesLeftToCapture()), 30_000);
    return () => clearInterval(id);
  }, []);

  const clamped = Math.max(0, Math.min(1, progress));
  const pct = Math.round(clamped * 100);
  const displayProgress = clamped === 0 ? 0.04 : clamped;

  const widthAnim = useRef(new Animated.Value(displayProgress)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: displayProgress,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [displayProgress, widthAnim]);

  const widthInterpolated = useMemo(
    () =>
      widthAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ["0%", "100%"],
      }),
    [widthAnim]
  );

  const barHeight = 36;

  return (
    <View
      style={{
        borderRadius: 16,
        backgroundColor: BG,
        paddingHorizontal: 18,
        paddingVertical: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 22,
          color: "#FFFFFF",
          marginBottom: 12,
        }}
      >
        You&apos;ve captured{" "}
        <Text
          style={{
            fontFamily: "Roboto-Bold",
            color: ACCENT,
          }}
        >
          {pct}%
        </Text>{" "}
        of your {year} (so far)
      </Text>

      <View
        style={{
          height: barHeight,
          borderRadius: barHeight / 2,
          borderWidth: 2,
          borderColor: STROKE,
          overflow: "hidden",
          backgroundColor: "rgba(240, 215, 255, 0.22)",
        }}
      >
        <StripedTrack width="100%" height={barHeight} />
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: widthInterpolated,
            backgroundColor: ACCENT,
            borderRightWidth: clamped >= 0.995 ? 0 : 2,
            borderRightColor: STROKE,
          }}
        />
      </View>

      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 12,
          lineHeight: 18,
          color: "rgba(255,255,255,0.88)",
          marginTop: 10,
          fontStyle: "italic",
        }}
      >
        <Text style={{ fontFamily: "Roboto-BoldItalic", color: ACCENT }}>
          {minutesLeft.toLocaleString()} minute{minutesLeft === 1 ? "" : "s"}
        </Text>
        {" left to capture today"}
      </Text>
    </View>
  );
}

/** Diagonal hatch for the unfilled track portion. */
function StripedTrack({ width, height }: { width: string; height: number }) {
  const lines = [];
  const step = 8;
  for (let x = -height; x < 400; x += step) {
    lines.push(
      <Line
        key={x}
        x1={x}
        y1={0}
        x2={x + height}
        y2={height}
        stroke="rgba(240, 215, 255, 0.35)"
        strokeWidth={1}
      />
    );
  }
  return (
    <Svg width={width} height={height} style={{ position: "absolute" }}>
      <Rect x={0} y={0} width="100%" height={height} fill="transparent" />
      {lines}
    </Svg>
  );
}
