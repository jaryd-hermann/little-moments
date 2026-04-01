import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

function Dot({
  delay,
  color,
}: {
  delay: number;
  color: string;
}) {
  const ty = useSharedValue(0);

  useEffect(() => {
    ty.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-7, { duration: 320 }),
          withTiming(0, { duration: 320 })
        ),
        -1,
        false
      )
    );
  }, [delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

export function ThinkingDots() {
  const { colors } = useTheme();
  const dotColor = colors.textMuted;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        height: 22,
        marginBottom: 16,
        alignSelf: "flex-start",
      }}
    >
      <Dot delay={0} color={dotColor} />
      <Dot delay={140} color={dotColor} />
      <Dot delay={280} color={dotColor} />
    </View>
  );
}
