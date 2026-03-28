import { View, Text, Pressable, Dimensions } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { format } from "date-fns";
import type { Entry } from "@/store/entryStore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.82;
const CARD_GAP = 16;
const CARD_TOTAL = CARD_WIDTH + CARD_GAP;
const SIDE_SPACING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

interface ThreeDTimelineProps {
  entries: Entry[];
  onExitPress: () => void;
}

function TimelineCard({
  entry,
  index,
  scrollX,
}: {
  entry: Entry;
  index: number;
  scrollX: Animated.SharedValue<number>;
}) {
  const { colors } = useTheme();
  const center = index * CARD_TOTAL;

  const animatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(
      scrollX.value,
      [center - CARD_TOTAL, center, center + CARD_TOTAL],
      [35, 0, -35],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      scrollX.value,
      [center - CARD_TOTAL, center, center + CARD_TOTAL],
      [0.75, 1.0, 0.75],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      scrollX.value,
      [center - CARD_TOTAL, center, center + CARD_TOTAL],
      [0.5, 1.0, 0.5],
      Extrapolation.CLAMP
    );
    const translateY = interpolate(
      scrollX.value,
      [center - CARD_TOTAL, center, center + CARD_TOTAL],
      [30, 0, 30],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${rotateY}deg` },
        { scale },
        { translateY },
      ],
      opacity,
    };
  });

  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "MMMM d, yyyy")
    : `${entry.entry_year}`;

  const bodyPreview = stripHtml(entry.body);

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={() => router.push(`/entry/${entry.id}`)}
        style={{
          width: CARD_WIDTH,
          minHeight: 280,
          justifyContent: "space-between",
          overflow: "hidden",
          borderRadius: 16,
          padding: 24,
          backgroundColor: colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          {dateStr}
        </Text>
        <View style={{ marginTop: 16, flex: 1 }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 22,
              color: colors.text,
            }}
            numberOfLines={2}
          >
            {entry.title ?? stripHtml(entry.body).slice(0, 60)}
          </Text>
          {bodyPreview.length > 0 && (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 22,
                marginTop: 12,
              }}
              numberOfLines={4}
            >
              {bodyPreview}
            </Text>
          )}
        </View>
        {entry.entry_type === "crash_and_burn" && (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              marginTop: 8,
            }}
          >
            Memory Jog
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function ThreeDTimeline({
  entries,
  onExitPress,
}: ThreeDTimelineProps) {
  const { colors } = useTheme();
  const scrollX = useSharedValue(0);
  const insets = useSafeAreaInsets();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const progressStyle = useAnimatedStyle(() => {
    const maxScroll = Math.max(0, entries.length - 1) * CARD_TOTAL;
    const progress = maxScroll > 0 ? scrollX.value / maxScroll : 0;
    return { width: `${Math.min(progress * 100, 100)}%` };
  });

  if (entries.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 16,
            color: colors.textSecondary,
            textAlign: "center",
            lineHeight: 24,
          }}
        >
          Your story is just beginning.{"\n"}Add your first moment.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable
        onPress={onExitPress}
        style={{
          position: "absolute",
          right: 16,
          top: insets.top + 8,
          zIndex: 10,
          borderRadius: 9999,
          backgroundColor: colors.surfaceSecondary,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 13,
            color: colors.text,
          }}
        >
          Exit Flipbook
        </Text>
      </Pressable>

      <Animated.FlatList
        data={entries}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_TOTAL}
        snapToAlignment="center"
        contentContainerStyle={{
          paddingHorizontal: SIDE_SPACING,
          alignItems: "center",
          gap: CARD_GAP,
        }}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TimelineCard
            entry={item}
            index={index}
            scrollX={scrollX}
          />
        )}
      />

      <View
        style={{
          marginHorizontal: 24,
          marginBottom: insets.bottom + 16,
          height: 2,
          overflow: "hidden",
          borderRadius: 9999,
          backgroundColor: colors.border,
        }}
      >
        <Animated.View
          style={[
            {
              height: "100%",
              borderRadius: 9999,
              backgroundColor: colors.text,
            },
            progressStyle,
          ]}
        />
      </View>
    </View>
  );
}
