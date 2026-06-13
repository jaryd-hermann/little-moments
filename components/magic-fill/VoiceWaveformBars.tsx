import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
} from "react-native-reanimated";

const BAR_COUNT = 20;

function WaveBar({
  index,
  isActive,
  barColor,
}: {
  index: number;
  isActive: boolean;
  barColor: string;
}) {
  const height = useSharedValue(8);

  useEffect(() => {
    if (isActive) {
      const maxH = 16 + Math.random() * 32;
      const dur = 300 + Math.random() * 400;
      height.value = withDelay(
        index * 25,
        withRepeat(
          withSequence(
            withTiming(maxH, { duration: dur }),
            withTiming(8 + Math.random() * 10, { duration: dur })
          ),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(8, { duration: 200 });
    }
  }, [isActive, height, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 3,
          borderRadius: 2,
          backgroundColor: barColor,
        },
        animatedStyle,
      ]}
    />
  );
}

export function VoiceWaveformBars({
  isActive,
  barColor,
}: {
  isActive: boolean;
  barColor: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 48,
        gap: 3,
        marginTop: 12,
      }}
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} index={i} isActive={isActive} barColor={barColor} />
      ))}
    </View>
  );
}
