import type { ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";

const GUTTER = 20;

export function CaptureBrowseHeading({
  title,
  titleSecondary,
  upperLabel = "CAPTURING FOR",
  hideChangeDay,
  onPressChangeDay,
  topLeftAction,
  titleAccessory,
  tagBubble,
  statsRow,
}: {
  title: string;
  /** Inline muted suffix rendered after the title (e.g. ", Jun 8"). */
  titleSecondary?: string;
  /** First line above the day title (e.g. `YOU CAPTURED` on the post-save home). */
  upperLabel?: string;
  hideChangeDay?: boolean;
  onPressChangeDay?: () => void;
  topLeftAction?: { label: string; onPress: () => void };
  /** Shown on the same row as the title (e.g. “Do a prompt instead”). */
  titleAccessory?: ReactNode;
  /** Optional bubble (pill) rendered next to the chevron — e.g. moment count. */
  tagBubble?: ReactNode;
  /** Lifetime stats (streak + total moments). Rendered on the upperLabel row. */
  statsRow?: ReactNode;
}) {
  const { colors } = useTheme();

  const titleRow = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        flexWrap: "nowrap",
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <Text
        style={{
          fontFamily: "PMGothicLudington-Text110",
          fontSize: 32,
          color: colors.text,
          lineHeight: 38,
        }}
      >
        {title}
      </Text>
      {titleSecondary ? (
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 32,
            color: colors.text,
            opacity: 0.6,
            lineHeight: 38,
          }}
        >
          {titleSecondary}
        </Text>
      ) : null}
      {!hideChangeDay ? (
        <View style={{ marginBottom: 6, marginLeft: 2 }}>
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </View>
      ) : null}
      {tagBubble ? (
        <View style={{ marginLeft: 8, marginBottom: 8 }}>{tagBubble}</View>
      ) : null}
    </View>
  );

  return (
    <View style={{ paddingHorizontal: GUTTER, marginBottom: 10 }}>
      {topLeftAction ? (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            topLeftAction.onPress();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: colors.primary,
            }}
          >
            {topLeftAction.label}
          </Text>
        </Pressable>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 11,
              letterSpacing: 1.2,
              color: colors.textMuted,
              marginBottom: 4,
            }}
          >
            {upperLabel}
          </Text>
          {!hideChangeDay ? (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onPressChangeDay?.();
              }}
            >
              {titleRow}
            </Pressable>
          ) : (
            titleRow
          )}
        </View>
        {statsRow ? (
          <View style={{ flexShrink: 0 }}>{statsRow}</View>
        ) : null}
        {titleAccessory ? (
          <View style={{ marginBottom: 6, alignItems: "flex-end" }}>
            {titleAccessory}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function MomentCountPill({ count }: { count: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 12,
          color: colors.text,
        }}
      >
        {`${count} ${count === 1 ? "Moment" : "Moments"}`}
      </Text>
    </View>
  );
}

export function StatRing({
  count,
  chipColor,
  label,
  onPress,
}: {
  count: number;
  chipColor: string;
  label: string;
  onPress?: () => void;
}) {
  const { colors, theme } = useTheme();
  const RING_SIZE = 56;
  const CHIP_OVERLAP = 10;
  const ringFill = theme === "dark" ? colors.surfaceSecondary : "#FFFFFF";

  const content = (
    <View style={{ alignItems: "center", width: 72 }}>
      <View
        style={{
          width: RING_SIZE,
          height: RING_SIZE,
          borderRadius: RING_SIZE / 2,
          borderWidth: 2,
          borderColor: colors.text,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: ringFill,
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 24,
            lineHeight: 26,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {count}
        </Text>
      </View>
      <View
        style={{
          marginTop: -CHIP_OVERLAP,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 9999,
          backgroundColor: chipColor,
          borderWidth: 2,
          borderColor: colors.text,
          maxWidth: 84,
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 10,
            letterSpacing: 0.3,
            color: "#1A1A1A",
            textAlign: "center",
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
    >
      {content}
    </Pressable>
  );
}

export function CaptureStatsRow({
  moments,
  chapters,
}: {
  moments: number;
  chapters: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <StatRing count={moments} chipColor="#A6E3E0" label="Moments" />
      <StatRing count={chapters} chipColor="#F5C97A" label="Chapters" />
    </View>
  );
}

/** Width of one stat tile — ring + chip label without overlapping neighbours. */
const STAT_ITEM_WIDTH = 74;
/** Tray width: two full stats + two-thirds of the third visible before scrolling. */
const STAT_TRAY_WIDTH = Math.round((STAT_ITEM_WIDTH * 8) / 3);

type StatItem = {
  key: string;
  count: number;
  chipColor: string;
  label: string;
  onPress?: () => void;
};

export function CaptureStatsCarousel({
  moments,
  chapters,
  coreMemories,
  movies,
  currentStreak,
}: {
  moments: number;
  chapters: number;
  coreMemories: number;
  movies: number;
  currentStreak: number;
}) {
  const setMemoriesView = useTabViewIntentStore((s) => s.setMemoriesView);
  const setChaptersView = useTabViewIntentStore((s) => s.setChaptersView);
  const listRef = useRef<FlatList<StatItem>>(null);
  const loopAdjustingRef = useRef(false);

  const stats: StatItem[] = useMemo(
    () => [
      {
        key: "moments",
        count: moments,
        chipColor: "#A6E3E0",
        label: "Moments",
        onPress: () => {
          setMemoriesView("grid");
          router.push("/(tabs)/memories");
        },
      },
      {
        key: "chapters",
        count: chapters,
        chipColor: "#F5C97A",
        label: "Chapters",
        onPress: () => {
          setChaptersView("list");
          router.push("/(tabs)/chapters");
        },
      },
      {
        key: "core",
        count: coreMemories,
        chipColor: "#FECFB4",
        label: "Core",
        onPress: () => {
          useCapsuleFlipbookStore.getState().setPinnedOnly(true);
          setMemoriesView("grid");
          router.push({
            pathname: "/(tabs)/memories",
            params: { filter: "core" },
          });
        },
      },
      {
        key: "movies",
        count: movies,
        chipColor: "#C8B6FF",
        label: "Movies",
        onPress: () => {
          setChaptersView("grid");
          router.push("/(tabs)/chapters");
        },
      },
      {
        key: "current_streak",
        count: currentStreak,
        chipColor: "#FEEEB1",
        label: "Streak",
      },
    ],
    [
      chapters,
      coreMemories,
      currentStreak,
      moments,
      movies,
      setChaptersView,
      setMemoriesView,
    ]
  );

  const useLoop = stats.length > 1;
  const loopData = useMemo(
    () => (useLoop ? [...stats, ...stats, ...stats] : stats),
    [stats, useLoop]
  );
  const segmentLength = stats.length;

  useEffect(() => {
    if (!useLoop) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: segmentLength * STAT_ITEM_WIDTH,
        animated: false,
      });
    });
  }, [segmentLength, useLoop]);

  const normalizeLoopOffset = useCallback(
    (offsetX: number) => {
      if (!useLoop || loopAdjustingRef.current) return;
      const page = Math.round(offsetX / STAT_ITEM_WIDTH);
      if (page < segmentLength) {
        loopAdjustingRef.current = true;
        listRef.current?.scrollToOffset({
          offset: (page + segmentLength) * STAT_ITEM_WIDTH,
          animated: false,
        });
        loopAdjustingRef.current = false;
      } else if (page >= segmentLength * 2) {
        loopAdjustingRef.current = true;
        listRef.current?.scrollToOffset({
          offset: (page - segmentLength) * STAT_ITEM_WIDTH,
          animated: false,
        });
        loopAdjustingRef.current = false;
      }
    },
    [segmentLength, useLoop]
  );

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      normalizeLoopOffset(e.nativeEvent.contentOffset.x);
    },
    [normalizeLoopOffset]
  );

  const onScrollEndDrag = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      normalizeLoopOffset(e.nativeEvent.contentOffset.x);
    },
    [normalizeLoopOffset]
  );

  return (
    <View style={{ width: STAT_TRAY_WIDTH, overflow: "hidden" }}>
      <FlatList
        ref={listRef}
        data={loopData}
        keyExtractor={(item, i) => `${item.key}-${i}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={STAT_ITEM_WIDTH}
        decelerationRate="fast"
        disableIntervalMomentum
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onScrollEndDrag}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: STAT_ITEM_WIDTH,
          offset: STAT_ITEM_WIDTH * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={{ width: STAT_ITEM_WIDTH, alignItems: "center" }}>
            <StatRing
              count={item.count}
              chipColor={item.chipColor}
              label={item.label}
              onPress={item.onPress}
            />
          </View>
        )}
      />
    </View>
  );
}
