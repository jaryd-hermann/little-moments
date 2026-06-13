import { MashupCard } from "@/components/chapters/MashupCard";
import { DashedEmptyState } from "@/components/common/DashedEmptyState";
import { useTheme } from "@/hooks/useTheme";
import {
  bucketMomentsByMonth,
  bucketMomentsByWeek,
  bucketMomentsByYear,
  type MashupBucket,
  type MashupBucketType,
} from "@/lib/mashupBuckets";
import { enqueueClipsForPrefetch } from "@/lib/mediaPrefetch";
import type { Entry } from "@/store/entryStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

export interface ChaptersGridMashupViewProps {
  entries: Entry[];
  onOpenMashup: (bucket: MashupBucket) => void;
  /** Tap the share icon on a card. Optional — when omitted, the icon hides. */
  onShareMashup?: (bucket: MashupBucket) => void;
  /** Empty-state subtitle (e.g. weekly capture progress). */
  emptySubtitle?: string;
  onEmptyCtaPress?: () => void;
}

const SECTION_GAP = 28;
const OUTER_PAD = 20;
const CARD_GAP = 12;

/**
 * Grid view for the Chapters tab — three horizontally scrolling carousels
 * (Weeks / Months / Years) of looping mashup preview cards.
 *
 * Empty buckets are skipped; sections with zero buckets are not rendered at
 * all. Only the snapped card per section auto-loops, so we never have more
 * than three video players spinning concurrently across the screen.
 */
export function ChaptersGridMashupView({
  entries,
  onOpenMashup,
  onShareMashup,
  emptySubtitle,
  onEmptyCtaPress,
}: ChaptersGridMashupViewProps) {
  const { colors } = useTheme();

  const weeks = useMemo(() => bucketMomentsByWeek(entries), [entries]);
  const months = useMemo(() => bucketMomentsByMonth(entries), [entries]);
  const years = useMemo(() => bucketMomentsByYear(entries), [entries]);

  // Bump the first visible card of each section to the front of the
  // prefetch queue. The app-startup warm (in `useEntries.fetchEntries`)
  // covers everything; this just makes sure the *visible* clips load first
  // when the user lands on the grid.
  useEffect(() => {
    const visibleClips = [
      ...(weeks[0]?.clips.slice(0, 4) ?? []),
      ...(months[0]?.clips.slice(0, 4) ?? []),
      ...(years[0]?.clips.slice(0, 4) ?? []),
    ];
    if (visibleClips.length > 0) {
      enqueueClipsForPrefetch(visibleClips, 5000);
    }
  }, [weeks, months, years]);

  const anyBuckets = weeks.length + months.length + years.length > 0;
  if (!anyBuckets) {
    return (
      <DashedEmptyState
        title="Your video montages live here"
        singleLineTitle
        subtitle={
          emptySubtitle ??
          "Capture a few moments and we'll stitch them into shareable weekly, monthly, and yearly recap clips."
        }
        ctaLabel="Capture a moment"
        onCtaPress={onEmptyCtaPress ?? (() => undefined)}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: 8,
        paddingBottom: 120,
        gap: SECTION_GAP,
      }}
      showsVerticalScrollIndicator={false}
    >
      {weeks.length > 0 ? (
        <MashupSection
          title="Weeks"
          type="week"
          buckets={weeks}
          onOpenMashup={onOpenMashup}
          onShareMashup={onShareMashup}
        />
      ) : null}
      {months.length > 0 ? (
        <MashupSection
          title="Months"
          type="month"
          buckets={months}
          onOpenMashup={onOpenMashup}
          onShareMashup={onShareMashup}
        />
      ) : null}
      {years.length > 0 ? (
        <MashupSection
          title="Years"
          type="year"
          buckets={years}
          onOpenMashup={onOpenMashup}
          onShareMashup={onShareMashup}
        />
      ) : null}
    </ScrollView>
  );
}

function MashupSection({
  title,
  type: _type,
  buckets,
  onOpenMashup,
  onShareMashup,
}: {
  title: string;
  type: MashupBucketType;
  buckets: MashupBucket[];
  onOpenMashup: (bucket: MashupBucket) => void;
  onShareMashup?: (bucket: MashupBucket) => void;
}) {
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // Card sizing — ~85% of viewport width so the next card peeks. Height is a
  // 5:6 portrait ratio that matches the screenshot's hero feel.
  const CARD_WIDTH = Math.round(screenWidth * 0.84);
  const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.18);
  const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;

  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<FlatList<MashupBucket>>(null);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.max(0, Math.round(x / SNAP_INTERVAL));
      if (next !== activeIdx) {
        setActiveIdx(next);
        // Boost priority for the newly-active card so its clips warm
        // before the user taps in.
        const bucket = buckets[next];
        if (bucket) {
          enqueueClipsForPrefetch(bucket.clips.slice(0, 4), 4500);
        }
      }
    },
    [SNAP_INTERVAL, activeIdx, buckets]
  );

  return (
    <View>
      <Text
        style={{
          fontFamily: "PMGothicLudington-Text110",
          fontSize: 22,
          color: colors.text,
          paddingHorizontal: OUTER_PAD,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      <FlatList
        ref={listRef}
        data={buckets}
        keyExtractor={(b) => b.key}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        snapToAlignment="start"
        contentContainerStyle={{
          paddingHorizontal: OUTER_PAD,
          gap: CARD_GAP,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ height: CARD_HEIGHT }}
        renderItem={({ item, index }) => (
          <MashupCard
            bucket={item}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            isActive={index === activeIdx}
            onPress={onOpenMashup}
            onShare={onShareMashup}
          />
        )}
      />
      {buckets.length > 1 ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
          }}
        >
          {buckets.slice(0, Math.min(buckets.length, 8)).map((_, i) => {
            const active =
              i === activeIdx || (i === 7 && activeIdx >= 7);
            return (
              <View
                key={i}
                style={{
                  width: active ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: active
                    ? colors.primary
                    : colors.surfaceSecondary,
                }}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
