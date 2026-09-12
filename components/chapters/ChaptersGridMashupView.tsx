import { MashupCard } from "@/components/chapters/MashupCard";
import { MovieProgressPlaceholder } from "@/components/chapters/MovieProgressPlaceholder";
import { DashedEmptyState } from "@/components/common/DashedEmptyState";
import { useTheme } from "@/hooks/useTheme";
import type { AliasLookup } from "@/lib/canonicalPeople";
import {
  bucketMomentsByMonth,
  bucketMomentsByPerson,
  bucketMomentsByTheme,
  bucketMomentsByWeek,
  bucketMomentsByYear,
  closestPendingIdentityBucket,
  monthBucketKeyForDate,
  movieProgress,
  movieProgressForCount,
  weekBucketKeyForDate,
  yearBucketKeyForDate,
  type MashupBucket,
  type MovieProgress,
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
  /**
   * Alias → canonical-name lookup for the People section. Empty until the
   * user's `canonicalize-people` run lands, which just means the section
   * shows its progress placeholder a little longer.
   */
  peopleLookup: AliasLookup;
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
 * Grid view for the Chapters tab — one horizontally scrolling carousel per
 * movie kind (Weeks / Months / People / Themes / Years) of looping preview
 * cards.
 *
 * Every section renders as soon as the user has a single moment: a kind with
 * no movies yet shows a progress placeholder instead, so the shelf the movies
 * will land on is visible before they exist. Only the snapped card per section
 * auto-loops, so we never have more than five video players spinning at once.
 */
export function ChaptersGridMashupView({
  entries,
  peopleLookup,
  onOpenMashup,
  onShareMashup,
  emptySubtitle,
  onEmptyCtaPress,
}: ChaptersGridMashupViewProps) {
  const weeks = useMemo(() => bucketMomentsByWeek(entries), [entries]);
  const months = useMemo(() => bucketMomentsByMonth(entries), [entries]);
  const people = useMemo(
    () => bucketMomentsByPerson(entries, peopleLookup),
    [entries, peopleLookup]
  );
  const themes = useMemo(() => bucketMomentsByTheme(entries), [entries]);
  const years = useMemo(() => bucketMomentsByYear(entries), [entries]);

  // Bump the first visible card of each section to the front of the prefetch
  // queue. `useEntries.fetchEntries` also warms recent moments in the background;
  // this makes sure the *visible* clips load first when the user lands on Chapters.
  useEffect(() => {
    const visibleClips = [
      ...(weeks[0]?.clips.slice(0, 6) ?? []),
      ...(months[0]?.clips.slice(0, 6) ?? []),
      ...(people[0]?.clips.slice(0, 6) ?? []),
      ...(themes[0]?.clips.slice(0, 6) ?? []),
      ...(years[0]?.clips.slice(0, 6) ?? []),
    ];
    if (visibleClips.length > 0) {
      enqueueClipsForPrefetch(visibleClips, 5000);
    }
  }, [weeks, months, people, themes, years]);

  // Period placeholders always point at the period the user can still top up,
  // so the countdown never strands them on a month that already closed.
  const periodProgress = useMemo(
    () => ({
      week: movieProgress(entries, "week", weekBucketKeyForDate(new Date())),
      month: movieProgress(entries, "month", monthBucketKeyForDate(new Date())),
      year: movieProgress(entries, "year", yearBucketKeyForDate(new Date())),
    }),
    [entries]
  );

  const closestPerson = useMemo(
    () => closestPendingIdentityBucket(entries, "person", peopleLookup),
    [entries, peopleLookup]
  );
  const closestTheme = useMemo(
    () => closestPendingIdentityBucket(entries, "theme"),
    [entries]
  );

  const hasAnyMoment = useMemo(
    () => entries.some((e) => e.entry_type === "moment"),
    [entries]
  );

  // Before the very first moment there's nothing to make progress toward, so
  // five empty countdowns would read as five dead ends.
  if (!hasAnyMoment) {
    return (
      <DashedEmptyState
        image={require("@/assets/images/chapters-1.png")}
        imageAspectRatio={1014 / 981}
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
      <MashupSection
        title="Weeks"
        buckets={weeks}
        placeholderProgress={periodProgress.week}
        onOpenMashup={onOpenMashup}
        onShareMashup={onShareMashup}
      />
      <MashupSection
        title="Months"
        buckets={months}
        placeholderProgress={periodProgress.month}
        onOpenMashup={onOpenMashup}
        onShareMashup={onShareMashup}
      />
      <MashupSection
        title="People"
        buckets={people}
        placeholderProgress={movieProgressForCount(
          "person",
          closestPerson?.momentCount ?? 0
        )}
        placeholderSubject={
          closestPerson
            ? `with ${closestPerson.label}`
            : "featuring the same person"
        }
        onOpenMashup={onOpenMashup}
        onShareMashup={onShareMashup}
      />
      <MashupSection
        title="Themes"
        buckets={themes}
        placeholderProgress={movieProgressForCount(
          "theme",
          closestTheme?.momentCount ?? 0
        )}
        placeholderSubject={
          closestTheme ? `about ${closestTheme.label}` : "about the same theme"
        }
        onOpenMashup={onOpenMashup}
        onShareMashup={onShareMashup}
      />
      <MashupSection
        title="Years"
        buckets={years}
        placeholderProgress={periodProgress.year}
        onOpenMashup={onOpenMashup}
        onShareMashup={onShareMashup}
      />
    </ScrollView>
  );
}

function MashupSection({
  title,
  buckets,
  placeholderProgress,
  placeholderSubject = null,
  onOpenMashup,
  onShareMashup,
}: {
  title: string;
  buckets: MashupBucket[];
  /** Shown in place of the carousel while this kind has no movies yet. */
  placeholderProgress: MovieProgress;
  placeholderSubject?: string | null;
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
          enqueueClipsForPrefetch(bucket.clips.slice(0, 8), 4500);
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
      {buckets.length === 0 ? (
        <View style={{ paddingHorizontal: OUTER_PAD }}>
          <MovieProgressPlaceholder
            progress={placeholderProgress}
            subject={placeholderSubject}
            width={screenWidth - OUTER_PAD * 2}
          />
        </View>
      ) : (
        <>
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
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            style={{ height: CARD_HEIGHT }}
            renderItem={({ item }) => (
              <MashupCard
                bucket={item}
                width={CARD_WIDTH}
                height={CARD_HEIGHT}
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
                const active = i === activeIdx || (i === 7 && activeIdx >= 7);
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
        </>
      )}
    </View>
  );
}
