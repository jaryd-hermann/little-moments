import { View, Image } from "react-native";
import type { ImageSourcePropType } from "react-native";

/** Letterbox matches artwork; avoids harsh edges when using `contain`. */
const SLIDE_CANVAS_bg = "#FFFBF5";

interface OnboardingSlideProps {
  source: ImageSourcePropType;
  width: number;
  height: number;
}

/**
 * Full slide area with uniform scaling — no stretch. Assets are tall_portrait (~470×1024);
 * `contain` keeps aspect ratio; bars use the same cream as the PNGs.
 */
export function OnboardingSlide({
  source,
  width,
  height,
}: OnboardingSlideProps) {
  return (
    <View
      style={{
        width,
        height,
        backgroundColor: SLIDE_CANVAS_bg,
        overflow: "hidden",
      }}
    >
      <Image
        source={source}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityRole="image"
      />
    </View>
  );
}
