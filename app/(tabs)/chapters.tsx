import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { useEntries } from "@/hooks/useEntries";
import {
  chapterImageSlideToMedia,
  chapterWeekLabel,
  type ChapterRecord,
} from "@/lib/chapters";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { TryPremiumPill } from "@/components/common/TryPremiumPill";
import { Shimmer } from "@/components/common/Shimmer";
import { useUnseenStore } from "@/store/unseenStore";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { usePostHog } from "posthog-react-native";

const REQUIRED_PER_WEEK = 4;

function startOfMondayWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day + 6) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export default function ChaptersScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const {
    chapters,
    fetchChapters,
    markChapterViewedLocal,
    isChapterLocked,
  } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapters = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapters() : []),
    [dummyEnabled]
  );
  const realOrDummy = dummyEnabled ? dummyChapters : chapters;

  const { entries } = useEntries();
  const thisWeekMomentsCount = useMemo(() => {
    const start = startOfMondayWeek(new Date());
    const startTs = start.getTime();
    return entries.filter((e) => {
      if (e.entry_type !== "moment" || !e.entry_date) return false;
      const d = new Date(`${e.entry_date}T00:00:00`);
      return d.getTime() >= startTs;
    }).length;
  }, [entries]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [openChapter, setOpenChapter] = useState<ChapterRecord | null>(null);

  // Fade-to-black overlay when opening a chapter.
  const fadeOpacity = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fadeOpacity.value }));

  // Card transition animation on swipe.
  const cardOpacity = useSharedValue(1);
  const cardTranslateY = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  useFocusEffect(
    useCallback(() => {
      fetchChapters();
    }, [fetchChapters])
  );

  // Consume pending chapter id from a tapped notification — open the matching chapter.
  useFocusEffect(
    useCallback(() => {
      const pendingId = useChapterNotifStore.getState().consume();
      if (!pendingId) return;
      const target = realOrDummy.find((c) => c.id === pendingId);
      if (target) {
        setActiveIdx(realOrDummy.indexOf(target));
        triggerFadeAndOpen(target);
      }
    }, [realOrDummy])
  );

  const triggerFadeAndOpen = useCallback(
    (chapter: ChapterRecord) => {
      // Free-tier paywalling: locked (5th+) chapters go through the same
      // `paywall` flag-aware entry as every other premium CTA so the A/B
      // split (test → /paywall, control → /ellie-premium) is respected.
      if (isChapterLocked(chapter)) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        launchPremiumFlow(posthog, "chapter_locked", {
          bump: { surface: "chapter", refId: chapter.id },
        });
        return;
      }

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      fadeOpacity.value = withTiming(1, { duration: 350 });
      setTimeout(() => {
        setOpenChapter(chapter);
        fadeOpacity.value = withTiming(0, { duration: 250 });
      }, 350);

      // Optimistically clear the unseen flag locally so the in-feed shimmer
      // drops immediately. The actual DB write + PostHog event are owned by
      // ChapterStoryViewer.handleOpen so every entry point (Capsule list,
      // push notification, etc.) gets the same behavior.
      if (chapter.viewed_at == null && !chapter.id.startsWith("dummy-")) {
        markChapterViewedLocal(chapter.id);
      }
    },
    [fadeOpacity, markChapterViewedLocal, isChapterLocked, posthog]
  );

  const handleSwipe = useCallback(
    (delta: number) => {
      const nextIdx = activeIdx + delta;
      if (nextIdx < 0 || nextIdx >= realOrDummy.length) return;
      void Haptics.impactAsync(
        delta > 0
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light
      );
      setActiveIdx(nextIdx);
      cardOpacity.value = 0;
      cardTranslateY.value = delta > 0 ? 24 : -24;
      cardOpacity.value = withTiming(1, { duration: 280 });
      cardTranslateY.value = withTiming(0, { duration: 280 });
    },
    [activeIdx, realOrDummy.length, cardOpacity, cardTranslateY]
  );

  const handleTap = useCallback(() => {
    const c = realOrDummy[activeIdx];
    if (c) triggerFadeAndOpen(c);
  }, [realOrDummy, activeIdx, triggerFadeAndOpen]);

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onEnd((e) => {
      if (e.translationY < -40) runOnJS(handleSwipe)(1);
      else if (e.translationY > 40) runOnJS(handleSwipe)(-1);
    });
  const tap = Gesture.Tap()
    .maxDuration(220)
    .onEnd(() => runOnJS(handleTap)());
  const composed = Gesture.Exclusive(pan, tap);

  const current = realOrDummy[activeIdx];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: colors.text,
            flexShrink: 1,
          }}
        >
          Chapters
        </Text>
        <TryPremiumPill source="chapters_header" />
      </View>

      {realOrDummy.length === 0 ? (
        <ChaptersEmptyPlaceholder thisWeekCount={thisWeekMomentsCount} />
      ) : current ? (
        <View
          style={{
            flex: 1,
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 100,
          }}
        >
          <GestureDetector gesture={composed}>
            <Animated.View
              style={[
                {
                  flex: 1,
                  borderRadius: 18,
                  overflow: "hidden",
                  backgroundColor: colors.surfaceSecondary,
                },
                cardStyle,
              ]}
            >
              <ChapterCoverCard chapter={current} />
              <ChapterCoverShimmer
                chapterId={current.id}
                viewedAt={current.viewed_at}
              />
              {isChapterLocked(current) && <ChapterLockedOverlay />}
            </Animated.View>
          </GestureDetector>
        </View>
      ) : null}

      {/* Fade-to-black overlay during chapter open */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#000000",
          },
          fadeStyle,
        ]}
      />

      <ChapterStoryViewer
        visible={!!openChapter}
        chapter={openChapter}
        onClose={() => setOpenChapter(null)}
      />
    </SafeAreaView>
  );
}

function ChapterCoverShimmer({
  chapterId,
  viewedAt,
}: {
  chapterId: string;
  viewedAt: string | null;
}) {
  // Match `ThreadCard` semantics: a chapter is visually unseen until either
  // the row's viewed_at column is set OR the user opened it during this
  // session (the cross-screen viewed set).
  const viewedInSession = useUnseenStore((s) =>
    s.viewedChapterIds.has(chapterId)
  );
  if (viewedAt != null || viewedInSession) return null;
  return <Shimmer active bandWidth={120} intervalMs={1300} />;
}

function ChapterLockedOverlay() {
  const { colors, theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: 18,
        backgroundColor:
          theme === "dark" ? "rgba(0,0,0,0.78)" : "rgba(255,255,255,0.92)",
        justifyContent: "center",
        alignItems: "center",
        padding: 24,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <Ionicons name="lock-closed" size={22} color={colors.primary} />
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: colors.primary,
          }}
        >
          Chapter locked
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 20,
          color: colors.text,
          textAlign: "center",
        }}
      >
        Upgrade to unlock this chapter.
      </Text>
    </View>
  );
}

function ChapterCoverCard({ chapter }: { chapter: ChapterRecord }) {
  const label = chapterWeekLabel(chapter);
  const collageMedia = chapter.image_slide
    ? chapterImageSlideToMedia(chapter.image_slide)
    : [];

  return (
    <>
      <CollageGrid media={collageMedia} />

      {/* Bottom gradient for legibility */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.78)"]}
        start={{ x: 0.5, y: 0.4 }}
        end={{ x: 0.5, y: 1 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "60%",
        }}
        pointerEvents="none"
      />

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: 28,
        }}
        pointerEvents="none"
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: "rgba(255,255,255,0.78)",
            letterSpacing: 2,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Chapter {chapter.chapter_number}
        </Text>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            lineHeight: 34,
            color: "#FFFFFF",
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          {chapter.moment_count} moments captured
        </Text>
      </View>
    </>
  );
}

function CollageGrid({
  media,
}: {
  media: ReturnType<typeof chapterImageSlideToMedia>;
}) {
  if (media.length === 0) {
    return (
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "#222222",
        }}
      />
    );
  }

  // Build a list of "rows" of 1 or 2 images so the card always fills the
  // full vertical space. For odd counts we lead with a single full-width
  // row, then pair the remaining images two-up. Each row uses flex: 1 so
  // they stretch evenly across the card.
  type Row = (typeof media)[number][];
  const rows: Row[] = [];
  let idx = 0;
  if (media.length % 2 === 1) {
    rows.push([media[idx++]]);
  }
  while (idx < media.length) {
    rows.push([media[idx], media[idx + 1]]);
    idx += 2;
  }

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "column",
      }}
    >
      {rows.map((row, ri) => (
        <View key={ri} style={{ flex: 1, flexDirection: "row" }}>
          {row.map((m, ci) => (
            <View key={`${ri}-${ci}`} style={{ flex: 1, overflow: "hidden" }}>
              <EntryMediaImage
                media={m}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function ChaptersEmptyPlaceholder({
  thisWeekCount,
}: {
  thisWeekCount: number;
}) {
  const { colors, theme } = useTheme();
  const remaining = Math.max(0, REQUIRED_PER_WEEK - thisWeekCount);
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 100,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 24,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.border,
          padding: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 120,
            height: 80,
            marginBottom: 28,
            position: "relative",
          }}
        >
          {[
            { left: 6, top: 18 },
            { left: 36, top: 0 },
            { left: 70, top: 24 },
            { left: 30, top: 48 },
          ].map((p, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: p.left,
                top: p.top,
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: colors.primary,
                borderWidth: 1,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            lineHeight: 26,
            color: colors.text,
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          Your weekly chapter{"\n"}lives here
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {remaining > 0
            ? `Add ${remaining} more moment${remaining === 1 ? "" : "s"} this week to get a chapter created.`
            : "You're set for this week — we'll publish your chapter next Monday."}
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/today")}
          style={{
            height: 56,
            paddingHorizontal: 28,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            ...bevelShadow(theme),
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: PINK_CTA_INK,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Capture a moment
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
