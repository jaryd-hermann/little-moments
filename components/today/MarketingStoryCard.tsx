import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { TOTAL_SLIDES } from "@/constants/storySlides";

export const PHILOSOPHY_ITEMS = [
  "Change the way you look at your life",
  "Develop the greatest skill: storytelling",
  "Finding stories in the everyday",
  "Do it easy. Do it daily",
];

const SEGMENT_COUNT = 8;
const RING_SIZE = 32;
const RING_THICKNESS = 3;
const GAP_DEG = 6;

function ProgressRing({
  watched,
  total,
  accentColor,
  iconColor,
}: {
  watched: number;
  total: number;
  accentColor: string;
  iconColor: string;
}) {
  const filled = Math.min(
    SEGMENT_COUNT,
    Math.round((watched / total) * SEGMENT_COUNT)
  );

  const segmentAngle = 360 / SEGMENT_COUNT;
  const halfSize = RING_SIZE / 2;

  return (
    <View
      style={{
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
        const startAngle = i * segmentAngle - 90;
        const isFilled = i < filled;

        const rad = ((startAngle + segmentAngle / 2) * Math.PI) / 180;
        const r = halfSize - RING_THICKNESS / 2;

        return (
          <View
            key={i}
            style={{
              position: "absolute",
              width: RING_THICKNESS,
              height: (RING_SIZE * Math.PI) / SEGMENT_COUNT - GAP_DEG / 2,
              borderRadius: RING_THICKNESS / 2,
              backgroundColor: isFilled ? accentColor : "rgba(128,128,128,0.2)",
              left: halfSize + Math.cos(rad) * r - RING_THICKNESS / 2,
              top: halfSize + Math.sin(rad) * r - ((RING_SIZE * Math.PI) / SEGMENT_COUNT - GAP_DEG / 2) / 2,
              transform: [{ rotate: `${startAngle + segmentAngle / 2}deg` }],
            }}
          />
        );
      })}
      <Ionicons name="arrow-forward" size={14} color={iconColor} />
    </View>
  );
}

interface MarketingStoryCardProps {
  onPressStory: (storyIndex: number) => void;
  storyProgress?: Record<number, number>;
  hideCompleted?: boolean;
  sectionTitle?: string;
}

export function MarketingStoryCard({
  onPressStory,
  storyProgress = {},
  hideCompleted = false,
  sectionTitle = "THE PHILOSOPHY",
}: MarketingStoryCardProps) {
  const { colors } = useTheme();

  const visibleItems = PHILOSOPHY_ITEMS.map((title, index) => ({
    title,
    index,
  })).filter(({ index }) => {
    if (!hideCompleted) return true;
    const watched = storyProgress[index] ?? 0;
    return watched < TOTAL_SLIDES;
  });

  if (visibleItems.length === 0) return null;

  return (
    <View>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {sectionTitle}
      </Text>

      <View style={{ gap: 12 }}>
        {visibleItems.map(({ title, index }) => {
          const watched = storyProgress[index] ?? 0;
          return (
            <Pressable
              key={index}
              onPress={() => onPressStory(index)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 15,
                  color: colors.text,
                  flex: 1,
                }}
              >
                {title}
              </Text>
              <View style={{ marginLeft: 12 }}>
                <ProgressRing
                  watched={watched}
                  total={TOTAL_SLIDES}
                  accentColor={colors.primary}
                  iconColor={colors.textSecondary}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
