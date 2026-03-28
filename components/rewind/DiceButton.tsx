import { Pressable } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";

interface DiceButtonProps {
  onPress: () => void;
}

export function DiceButton({ onPress }: DiceButtonProps) {
  const rotation = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    rotation.value = withSequence(
      withTiming(360, { duration: 300 }),
      withTiming(0, { duration: 0 })
    );
    onPress();
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          {
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
          },
          animatedStyle,
        ]}
      >
        <Ionicons name="dice-outline" size={26} color="rgba(255,255,255,0.85)" />
      </Animated.View>
    </Pressable>
  );
}
