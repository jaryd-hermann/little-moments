import { useEffect } from "react";
import { Dimensions, Image, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useFrameCallback,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated";
import { LOGO_COLORS } from "@/constants/logoColors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");
const LOGO_SIZE = 80;

interface BouncingLogoProps {
  onCornerHit?: () => void;
}

export function BouncingLogo({ onCornerHit }: BouncingLogoProps) {
  const x = useSharedValue(SCREEN_WIDTH / 2 - LOGO_SIZE / 2);
  const y = useSharedValue(SCREEN_HEIGHT / 2 - LOGO_SIZE / 2);
  const vx = useSharedValue(2.5);
  const vy = useSharedValue(2.0);
  const colorIndex = useSharedValue(0);

  useFrameCallback(() => {
    "worklet";
    let newX = x.value + vx.value;
    let newY = y.value + vy.value;
    let hitX = false;
    let hitY = false;

    if (newX <= 0) {
      newX = 0;
      vx.value = -vx.value;
      hitX = true;
    } else if (newX >= SCREEN_WIDTH - LOGO_SIZE) {
      newX = SCREEN_WIDTH - LOGO_SIZE;
      vx.value = -vx.value;
      hitX = true;
    }

    if (newY <= 0) {
      newY = 0;
      vy.value = -vy.value;
      hitY = true;
    } else if (newY >= SCREEN_HEIGHT - LOGO_SIZE) {
      newY = SCREEN_HEIGHT - LOGO_SIZE;
      vy.value = -vy.value;
      hitY = true;
    }

    if (hitX && hitY) {
      colorIndex.value =
        (colorIndex.value + 1) % LOGO_COLORS.length;
    }

    x.value = newX;
    y.value = newY;
  });

  const tintColor = useDerivedValue(() => {
    return LOGO_COLORS[colorIndex.value];
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { translateY: y.value },
    ],
    tintColor: tintColor.value,
  }));

  return (
    <Animated.Image
      source={require("@/assets/images/icon.png")}
      style={[styles.logo, animatedStyle]}
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    position: "absolute",
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    top: 0,
    left: 0,
  },
});
