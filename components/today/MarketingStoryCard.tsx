import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import {
  resolveStoryProgress,
  isMarketingStoryComplete,
  type MarketingStoryListItem,
} from "@/lib/marketingStories";

const SEGMENT_COUNT = 8;
const RING_SIZE = 32;
const RING_THICKNESS = 3;
const GAP_DEG = 6;

export type { MarketingStoryListItem };

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
    Math.round((watched / Math.max(total, 1)) * SEGMENT_COUNT)
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
  stories: MarketingStoryListItem[];
  onPressStory: (slug: string) => void;
  storyProgress?: Record<string, number>;
  hideCompleted?: boolean;
  sectionTitle?: string;
  /** If set, only cards whose slug is listed are shown (order follows `stories` order). */
  visibleSlugs?: string[];
}

export function MarketingStoryCard({
  stories,
  onPressStory,
  storyProgress = {},
  hideCompleted = false,
  sectionTitle = "THE PHILOSOPHY",
  visibleSlugs,
}: MarketingStoryCardProps) {
  const { colors } = useTheme();

  const slugSet =
    visibleSlugs && visibleSlugs.length > 0
      ? new Set(visibleSlugs)
      : null;

  const visibleItems = stories.filter(({ slug }) => {
    if (slugSet && !slugSet.has(slug)) return false;
    if (!hideCompleted) return true;
    const item = stories.find((s) => s.slug === slug);
    const total = item?.slideCount ?? 1;
    return !isMarketingStoryComplete(slug, total, storyProgress);
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
        {visibleItems.map(({ slug, title, description, slideCount }) => {
          const watched = resolveStoryProgress(slug, storyProgress);
          return (
            <Pressable
              key={slug}
              onPress={() => onPressStory(slug)}
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
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Regular",
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {title}
                </Text>
                {description ? (
                  <Text
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginTop: 6,
                      lineHeight: 19,
                    }}
                  >
                    {description}
                  </Text>
                ) : null}
              </View>
              <View style={{ marginLeft: 12 }}>
                <ProgressRing
                  watched={watched}
                  total={slideCount}
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
