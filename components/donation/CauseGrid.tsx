import { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ImageBackground,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { CAUSE_IMAGES, type DonationCause } from "@/constants/donationCauses";

const GRID_GAP = 10;
const GRID_PADDING_H = 24;
const CARD_RADIUS = 12;

type CauseGridProps = {
  causes: DonationCause[];
  selectedId: string | null;
  onSelect: (cause: DonationCause) => void;
};

export function CauseGrid({ causes, selectedId, onSelect }: CauseGridProps) {
  const { width: winWidth } = useWindowDimensions();
  const cardSize = (winWidth - GRID_PADDING_H * 2 - GRID_GAP) / 2;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: GRID_GAP,
        paddingHorizontal: GRID_PADDING_H,
      }}
    >
      {causes.map((cause) => (
        <CauseCard
          key={cause.id}
          cause={cause}
          size={cardSize}
          selected={cause.id === selectedId}
          onPress={() => {
            if (cause.id !== selectedId) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(cause);
            }
          }}
        />
      ))}
    </View>
  );
}

function CauseCard({
  cause,
  size,
  selected,
  onPress,
}: {
  cause: DonationCause;
  size: number;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(selected ? 1.03 : 1);
  const borderOpacity = useSharedValue(selected ? 1 : 0);

  const animatedContainer = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const animatedBorder = useAnimatedStyle(() => ({
    borderColor: `rgba(255, 255, 255, ${borderOpacity.value})`,
    borderWidth: 2,
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(1.03, { damping: 12, stiffness: 180 });
    borderOpacity.value = withTiming(1, { duration: 200 });
    onPress();
  }, [onPress]);

  if (selected) {
    scale.value = withSpring(1.03, { damping: 12, stiffness: 180 });
    borderOpacity.value = withTiming(1, { duration: 200 });
  } else {
    scale.value = withSpring(1, { damping: 12, stiffness: 180 });
    borderOpacity.value = withTiming(0, { duration: 200 });
  }

  const imageSource = CAUSE_IMAGES[cause.image_key];

  return (
    <Pressable onPress={handlePress}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: CARD_RADIUS,
            overflow: "hidden",
          },
          animatedContainer,
          animatedBorder,
        ]}
      >
        <ImageBackground
          source={imageSource}
          style={{ flex: 1, justifyContent: "flex-end" }}
          resizeMode="cover"
        >
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.7)"]}
            style={{
              paddingHorizontal: 12,
              paddingBottom: 12,
              paddingTop: 32,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#FFFFFF",
                lineHeight: 20,
              }}
            >
              {cause.title}
            </Text>
          </LinearGradient>
        </ImageBackground>
      </Animated.View>
    </Pressable>
  );
}
