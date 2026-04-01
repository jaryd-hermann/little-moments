import { StyleSheet, Dimensions, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { useEffect, useRef, useState, useCallback } from "react";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

interface PhotoSlideshowProps {
  uri: string | null;
}

/**
 * Double-buffered image display. The "back" layer holds the previous
 * photo while the "front" layer fades in the new one. During rapid
 * changes (dial spin) animations are skipped for instant swaps.
 */
export function PhotoSlideshow({ uri }: PhotoSlideshowProps) {
  const prevUri = useRef(uri);
  const lastChangeTs = useRef(0);
  const [backUri, setBackUri] = useState<string | null>(null);
  const frontOpacity = useSharedValue(1);

  useEffect(() => {
    if (uri === prevUri.current) return;

    const now = Date.now();
    const elapsed = now - lastChangeTs.current;
    lastChangeTs.current = now;

    if (elapsed < 200) {
      cancelAnimation(frontOpacity);
      frontOpacity.value = 1;
      setBackUri(null);
    } else {
      setBackUri(prevUri.current);
      frontOpacity.value = 0;
      frontOpacity.value = withTiming(1, { duration: 250 });
    }

    prevUri.current = uri;
  }, [uri]);

  const frontStyle = useAnimatedStyle(() => ({
    opacity: frontOpacity.value,
  }));

  if (!uri) {
    return <View style={[styles.image, { backgroundColor: "#111" }]} />;
  }

  return (
    <View style={styles.image}>
      {backUri ? (
        <Animated.Image
          source={{ uri: backUri }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : null}

      <Animated.Image
        source={{ uri }}
        style={[styles.image, frontStyle]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
