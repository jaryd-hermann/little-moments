import { StyleSheet, Dimensions, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useEffect, useRef } from "react";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

interface PhotoSlideshowProps {
  uri: string | null;
}

export function PhotoSlideshow({ uri }: PhotoSlideshowProps) {
  const opacity = useSharedValue(1);
  const prevUri = useRef(uri);

  useEffect(() => {
    if (uri !== prevUri.current) {
      opacity.value = withTiming(0, { duration: 150 }, () => {
        opacity.value = withTiming(1, { duration: 200 });
      });
      prevUri.current = uri;
    }
  }, [uri]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!uri) {
    return (
      <View style={[styles.image, { backgroundColor: "#111" }]} />
    );
  }

  return (
    <Animated.Image
      source={{ uri }}
      style={[styles.image, animatedStyle]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
