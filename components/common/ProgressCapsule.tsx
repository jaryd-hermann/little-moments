import { useTheme } from "@/hooks/useTheme";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Text, View, type StyleProp, type ViewStyle } from "react-native";

export interface ProgressCapsuleProps {
  /** Progress from 0 to 1. Values outside the range are clamped. */
  progress: number;
  /** Optional text rendered over the centre of the bar. */
  label?: string;
  /**
   * Optional label rendered over the filled (left) portion of the bar.
   * When set alongside `labelRight`, the bar shows split labels instead
   * of the single `label`.
   */
  labelFilled?: string;
  /** Optional label rendered centred WITHIN the cream/remaining segment. */
  labelRight?: string;
  /** Bar height (incl. outer border). Defaults to 28. */
  height?: number;
  /** Tone for the centred label text. Defaults to theme.text. */
  labelColor?: string;
  /** Override colour for `labelFilled`. Defaults to `labelColor`. */
  labelFilledColor?: string;
  /** Override colour for `labelRight`. Defaults to `labelColor`. */
  labelRightColor?: string;
  /** Bar styling override (e.g. margin, flex). */
  style?: StyleProp<ViewStyle>;
}

/**
 * Static progress capsule — same visual treatment as
 * `CountdownProgressBar` (teal track, pink fill, white inner + outer
 * border) but without timer behaviour. Used for "% of year captured" on
 * the Capture page and "% of month captured" badges in the Capsule grid.
 */
export function ProgressCapsule({
  progress,
  label,
  labelFilled,
  labelRight,
  height = 28,
  labelColor,
  labelFilledColor,
  labelRightColor,
  style,
}: ProgressCapsuleProps) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const displayProgress = clamped === 0 ? 0.07 : clamped;

  const widthAnim = useRef(new Animated.Value(displayProgress)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: displayProgress,
      duration: 380,
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

  const trackBg = "#FEEEB1";
  const fillBg = colors.primary;
  const outerBorderColor = colors.text;
  const labelSize = Math.max(11, Math.min(13, height - 16));
  /** Bar fills are light in both themes — labels stay dark for contrast. */
  const ink = labelColor ?? "#1A1A1A";

  return (
    <View
      style={[
        {
          height,
          borderRadius: height / 2,
          borderWidth: 2,
          borderColor: outerBorderColor,
          backgroundColor: trackBg,
          overflow: "hidden",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: widthInterpolated,
          backgroundColor: fillBg,
          borderTopRightRadius: clamped >= 1 ? 0 : height / 2,
          borderBottomRightRadius: clamped >= 1 ? 0 : height / 2,
        }}
      />
      {labelFilled != null || labelRight != null ? (
        <View
          pointerEvents="none"
          style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
        >
          <View
            style={{
              width: `${displayProgress * 100}%`,
              minWidth: labelFilled ? 56 : 0,
              paddingHorizontal: 8,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            {labelFilled ? (
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: labelSize,
                  color: labelFilledColor ?? ink,
                  letterSpacing: 0.3,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {labelFilled}
              </Text>
            ) : null}
          </View>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
              minWidth: 0,
            }}
          >
            {labelRight ? (
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: labelSize,
                  color: labelRightColor ?? ink,
                  letterSpacing: 0.3,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {labelRight}
              </Text>
            ) : null}
          </View>
        </View>
      ) : label ? (
        <View
          pointerEvents="none"
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: labelSize,
              color: ink,
              letterSpacing: 0.3,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
