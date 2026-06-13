import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

export interface CaptureFeedDay {
  /** Local-midnight Date for the day. */
  date: Date;
  /** `yyyy-MM-dd` key. */
  ymd: string;
}

export interface CaptureDayFeedProps {
  days: CaptureFeedDay[];
  /** Render the heading row for a section (rendered sticky). `index === 0`
   *  is the topmost day — the parent typically uses this to show "pinned"
   *  decorations (e.g. lifetime stats) only on the first heading so they
   *  don't repeat as the user scrolls between sticky days. */
  renderHeading: (day: CaptureFeedDay, index: number) => ReactNode;
  /** Render the body content for a section. */
  renderContent: (day: CaptureFeedDay, index: number) => ReactNode;
  /** Tap "Scroll further back" footer — loads more days. */
  onLoadMore?: () => void;
  /** Show the load-more footer (hidden when all reachable days are loaded). */
  canLoadMore?: boolean;
  /** Called as the dominant day in the viewport changes. */
  onDominantDayChange?: (day: CaptureFeedDay) => void;
  /** Deep-link target — when set the feed will scroll to this `ymd` once
   *  its section has been laid out. Parent should clear this via
   *  `onScrolledToTarget` to avoid re-scrolling on later renders. */
  scrollToYmd?: string | null;
  /** Notify parent the deep-link scroll has been issued so it can clear
   *  its scroll-target state. */
  onScrolledToTarget?: () => void;
}

/**
 * Vertical feed of day-sections for the Capture tab. Each section has a
 * sticky heading and its own body. The user can scroll between days without
 * opening the day-picker bottom sheet. The current target day is reported
 * back via `onDominantDayChange` so the parent can keep `captureTargetDate`
 * in sync with viewport position.
 */
export function CaptureDayFeed({
  days,
  renderHeading,
  renderContent,
  onLoadMore,
  canLoadMore = true,
  onDominantDayChange,
  scrollToYmd,
  onScrolledToTarget,
}: CaptureDayFeedProps) {
  const { colors } = useTheme();
  const sectionOffsetsRef = useRef<Map<string, number>>(new Map());
  const lastReportedYmdRef = useRef<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // Track which `ymd` we've already issued a scroll-to for so onLayout
  // re-renders don't re-trigger the scroll over and over (which manifests
  // as the feed "almost refreshing and moving"). Reset only when the
  // parent passes a new target.
  const scrolledForYmdRef = useRef<string | null>(null);
  // While scrolling to a deep-link target we suppress dominant-day
  // callbacks. Mid-flight scrolls would otherwise hijack the focal day
  // and re-trigger feed state updates that conflict with the target.
  const suppressDominantUntilRef = useRef(0);
  // Versioned signal so re-rendering the items (which fires onLayout) can
  // trigger another attempt at the deep-link scroll if the section wasn't
  // measured during the first attempt.
  const [layoutTick, setLayoutTick] = useState(0);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Date.now() < suppressDominantUntilRef.current) return;
      const y = e.nativeEvent.contentOffset.y;
      // Days are ordered newest-first (index 0 = today), and their offsets
      // grow monotonically (today at y≈0, oldest at the bottom). The
      // dominant day is the LAST one whose heading we've scrolled past;
      // walk in order and bail once the next heading is below the
      // viewport's top. A small +4px slop covers RN's sticky-header
      // activation pixel-rounding so we don't sit visually on a heading
      // while still reporting the previous day as focal.
      let dominant: CaptureFeedDay | null = null;
      for (const day of days) {
        const offset = sectionOffsetsRef.current.get(day.ymd);
        if (offset == null) continue;
        if (offset <= y + 4) dominant = day;
        else break;
      }
      const pick = dominant ?? days[0] ?? null;
      if (!pick) return;
      if (lastReportedYmdRef.current === pick.ymd) return;
      lastReportedYmdRef.current = pick.ymd;
      onDominantDayChange?.(pick);
    },
    [days, onDominantDayChange]
  );

  // Interleave heading + content so we can mark heading indices as sticky.
  // Indices: 0 = heading day0, 1 = content day0, 2 = heading day1, 3 = content day1, ...
  const stickyIndices: number[] = [];
  const items: ReactNode[] = [];
  days.forEach((day, i) => {
    stickyIndices.push(items.length);
    items.push(
      <View
        key={`heading-${day.ymd}`}
        style={{ backgroundColor: colors.background }}
        onLayout={(e) => {
          const prev = sectionOffsetsRef.current.get(day.ymd);
          const next = e.nativeEvent.layout.y;
          if (prev === next) return;
          sectionOffsetsRef.current.set(day.ymd, next);
          // Nudge the scroll-target effect to re-check.
          setLayoutTick((t) => t + 1);
        }}
      >
        {renderHeading(day, i)}
      </View>
    );
    items.push(
      <View key={`content-${day.ymd}`} style={{ marginBottom: i === days.length - 1 ? 0 : 32 }}>
        {renderContent(day, i)}
      </View>
    );
  });

  useEffect(() => {
    if (!scrollToYmd) {
      // Parent cleared the target — allow future re-targets of this ymd.
      scrolledForYmdRef.current = null;
      return;
    }
    // Already scrolled for this target — don't restart the animation as
    // sections behind us continue to lay out and bump `layoutTick`.
    if (scrolledForYmdRef.current === scrollToYmd) return;
    const y = sectionOffsetsRef.current.get(scrollToYmd);
    if (y == null) return; // section not yet measured; wait for next layoutTick
    scrolledForYmdRef.current = scrollToYmd;
    // Lock the dominant-day callback for the duration of the animation
    // (and a small buffer) so the freshly-measured target sticks as focal.
    suppressDominantUntilRef.current = Date.now() + 700;
    lastReportedYmdRef.current = scrollToYmd;
    scrollViewRef.current?.scrollTo({ y, animated: true });
    onScrolledToTarget?.();
    // We intentionally don't include `onScrolledToTarget` so we don't
    // re-run on identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToYmd, layoutTick]);

  return (
    <ScrollView
      ref={scrollViewRef}
      style={{ flex: 1 }}
      stickyHeaderIndices={stickyIndices}
      onScroll={handleScroll}
      scrollEventThrottle={32}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 140 }}
    >
      {items}

      {canLoadMore && onLoadMore ? (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLoadMore();
            }}
            style={({ pressed }) => ({
              alignSelf: "center",
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: colors.textMuted,
                letterSpacing: 0.5,
              }}
            >
              Scroll further back
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}
