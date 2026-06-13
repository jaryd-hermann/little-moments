import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { useEntries } from "@/hooks/useEntries";
import {
  type ChapterRecord,
} from "@/lib/chapters";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { usePostHog } from "posthog-react-native";
import { DashedEmptyState } from "@/components/common/DashedEmptyState";
import { ShareChapterModal } from "@/components/common/ShareChapterModal";
import { ShareMashupModal } from "@/components/common/ShareMashupModal";
import { InfoTipModal } from "@/components/common/InfoTipModal";
import { ChaptersGridMashupView } from "@/components/chapters/ChaptersGridMashupView";
import {
  ChapterCoverCard,
  ChapterCoverShimmer,
  ChapterLockedOverlay,
} from "@/components/chapters/ChapterCoverCard";
import { MashupPlayer, type MashupCloseReason } from "@/components/chapters/MashupPlayer";
import {
  MashupCompleteToaster,
  type MashupToasterAction,
} from "@/components/chapters/MashupCompleteToaster";
import type { MashupBucket } from "@/lib/mashupBuckets";
import {
  bucketMomentsByMonth,
  bucketMomentsByWeek,
  bucketMomentsByYear,
} from "@/lib/mashupBuckets";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";

const REQUIRED_PER_WEEK = 4;

type ChapterViewMode = "list" | "feed" | "grid";

const CHAPTER_VIEW_MODE_ICONS: Record<
  ChapterViewMode,
  keyof typeof Ionicons.glyphMap
> = {
  grid: "grid-outline",
  list: "list-outline",
  feed: "albums-outline",
};

function startOfMondayWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = (day + 6) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export default function ChaptersScreen() {
  const { colors, theme } = useTheme();
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
  const [shareChapter, setShareChapter] = useState<ChapterRecord | null>(null);
  const [viewMode, setViewMode] = useState<ChapterViewMode>("grid");
  const [openMashup, setOpenMashup] = useState<MashupBucket | null>(null);
  const [toasterBucket, setToasterBucket] = useState<MashupBucket | null>(null);
  const [shareMashup, setShareMashup] = useState<MashupBucket | null>(null);
  const [weeklyStoriesInfoOpen, setWeeklyStoriesInfoOpen] = useState(false);

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

  useFocusEffect(
    useCallback(() => {
      const intentView = useTabViewIntentStore.getState().consumeChaptersView();
      if (intentView) setViewMode(intentView);

      const mashupKey = useTabViewIntentStore.getState().consumeOpenMashupKey();
      if (mashupKey) {
        const allBuckets = [
          ...bucketMomentsByWeek(entries),
          ...bucketMomentsByMonth(entries),
          ...bucketMomentsByYear(entries),
        ];
        const bucket = allBuckets.find((b) => b.key === mashupKey);
        if (bucket) setOpenMashup(bucket);
      }

      const chapterId = useTabViewIntentStore.getState().consumeOpenChapterId();
      if (chapterId) {
        const target = realOrDummy.find((c) => c.id === chapterId);
        if (target) triggerFadeAndOpen(target);
      }
    }, [entries, realOrDummy, triggerFadeAndOpen])
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

  const remainingForChapters = Math.max(0, REQUIRED_PER_WEEK - thisWeekMomentsCount);

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
          gap: 8,
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.surfaceSecondary,
              borderRadius: 9999,
              padding: 3,
            }}
          >
            {(["grid", "list", "feed"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setViewMode(mode);
                  posthog.capture("chapters_view_mode_changed", { mode });
                }}
                accessibilityLabel={`${mode} view`}
                style={{
                  width: 34,
                  height: 30,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 9999,
                  backgroundColor:
                    viewMode === mode ? colors.primary : "transparent",
                }}
              >
                <Ionicons
                  name={CHAPTER_VIEW_MODE_ICONS[mode]}
                  size={16}
                  color={
                    viewMode === mode
                      ? theme === "dark"
                        ? "#1A1A1A"
                        : colors.text
                      : theme === "dark"
                        ? "#FFFFFF"
                        : colors.textMuted
                  }
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {viewMode === "grid" ? (
        <ChaptersGridMashupView
          entries={entries}
          emptySubtitle={
            remainingForChapters > 0
              ? `Add ${remainingForChapters} more moment${remainingForChapters === 1 ? "" : "s"} this week to start building your montages.`
              : "You're set for this week — keep capturing and your montages will grow."
          }
          onEmptyCtaPress={() => router.push("/(tabs)/today")}
          onOpenMashup={(bucket) => {
            posthog.capture("mashup_played", {
              bucket_type: bucket.type,
              bucket_key: bucket.key,
              clip_count: bucket.count,
            });
            setOpenMashup(bucket);
          }}
          onShareMashup={(bucket) => {
            posthog.capture("mashup_share_tapped", {
              bucket_type: bucket.type,
              bucket_key: bucket.key,
              clip_count: bucket.count,
              source: "card",
            });
            setShareMashup(bucket);
          }}
        />
      ) : realOrDummy.length === 0 ? (
        <DashedEmptyState
          title="Your weekly chapter lives here"
          singleLineTitle
          subtitle={
            remainingForChapters > 0
              ? `Add ${remainingForChapters} more moment${remainingForChapters === 1 ? "" : "s"} this week to get a chapter created.`
              : "You're set for this week — we'll publish your chapter next Monday."
          }
          ctaLabel="Capture a moment"
          onCtaPress={() => router.push("/(tabs)/today")}
        />
      ) : viewMode === "list" ? (
        <ChapterListView
          chapters={realOrDummy}
          isChapterLocked={isChapterLocked}
          onOpen={triggerFadeAndOpen}
          onShare={(c) => {
            posthog.capture("chapter_share_tapped", {
              chapter_id: c.id,
              source: "chapter_list",
            });
            setShareChapter(c);
          }}
          onInfoPress={() => setWeeklyStoriesInfoOpen(true)}
        />
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

          {/* Top-right share button lives OUTSIDE the gesture detector so its
              tap doesn't propagate to the card's tap-to-open handler. */}
          {!isChapterLocked(current) && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                posthog.capture("chapter_share_tapped", {
                  chapter_id: current.id,
                  source: "chapter_card",
                });
                setShareChapter(current);
              }}
              hitSlop={10}
              accessibilityLabel="Share chapter"
              style={{
                position: "absolute",
                top: 16,
                right: 36,
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: "rgba(0,0,0,0.4)",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
              }}
            >
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            </Pressable>
          )}
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
        onShare={(c) => {
          posthog.capture("chapter_share_tapped", {
            chapter_id: c.id,
            source: "chapter_completion_modal",
          });
          setOpenChapter(null);
          setShareChapter(c);
        }}
      />

      <ShareChapterModal
        visible={!!shareChapter}
        chapter={shareChapter}
        onDismiss={() => setShareChapter(null)}
      />

      <ShareMashupModal
        visible={!!shareMashup}
        bucket={shareMashup}
        onDismiss={() => setShareMashup(null)}
      />

      <InfoTipModal
        visible={weeklyStoriesInfoOpen}
        onClose={() => setWeeklyStoriesInfoOpen(false)}
        title="Stories of your weeks"
        scrollable
      >
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
          }}
        >
          Each week you capture enough moments, we write a chapter — a short
          story stitched from what you saved that week. Think of it as a
          narrative recap of your life, one week at a time.
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            marginTop: 12,
          }}
        >
          Open any chapter to read the full story, browse the photos, and share
          it with someone who was there — or someone you wish had been.
        </Text>
      </InfoTipModal>

      <MashupPlayer
        visible={!!openMashup}
        bucket={openMashup}
        onCompleteOrClose={(reason: MashupCloseReason, lastClipIndex) => {
          const bucket = openMashup;
          if (!bucket) return;
          posthog.capture(
            reason === "auto_end" ? "mashup_completed" : "mashup_closed",
            {
              bucket_type: bucket.type,
              bucket_key: bucket.key,
              clip_count: bucket.count,
              last_clip_index: lastClipIndex,
            }
          );
          setOpenMashup(null);
          setToasterBucket(bucket);
        }}
      />

      <MashupCompleteToaster
        visible={!!toasterBucket}
        bucket={toasterBucket}
        onDismiss={() => setToasterBucket(null)}
        onAction={(action: MashupToasterAction) => {
          const bucket = toasterBucket;
          posthog.capture(
            action === "share"
              ? "mashup_share_tapped"
              : "mashup_replay_tapped",
            bucket
              ? {
                  bucket_type: bucket.type,
                  bucket_key: bucket.key,
                  clip_count: bucket.count,
                  source: "toaster",
                }
              : undefined
          );
          setToasterBucket(null);

          if (action === "share" && bucket) {
            setShareMashup(bucket);
            return;
          }

          // "Watch it again" re-opens the full-screen player with the same
          // bucket from clip 0. We wait a beat so the toaster's slide-down
          // animation finishes before the player's fade-in starts (iOS only
          // shows one modal at a time, so this also avoids a stacking race).
          if (action === "replay" && bucket) {
            setTimeout(() => {
              posthog.capture("mashup_played", {
                bucket_type: bucket.type,
                bucket_key: bucket.key,
                clip_count: bucket.count,
                source: "replay",
              });
              setOpenMashup(bucket);
            }, 280);
          }
        }}
      />
    </SafeAreaView>
  );
}

/**
 * Default ("list") view — vertical scrolling list of chapter cards. Each
 * card mirrors the cover layout used in the "feed" (flipbook) view but at a
 * fixed compact height so users can browse all chapters at once.
 */
function ChapterListView({
  chapters,
  isChapterLocked,
  onOpen,
  onShare,
  onInfoPress,
}: {
  chapters: ChapterRecord[];
  isChapterLocked: (c: ChapterRecord) => boolean;
  onOpen: (c: ChapterRecord) => void;
  onShare: (c: ChapterRecord) => void;
  onInfoPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 120,
        gap: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 22,
            color: colors.text,
            flex: 1,
          }}
        >
          Stories of your weeks
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onInfoPress();
          }}
          hitSlop={10}
          accessibilityLabel="About weekly chapters"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      </View>

      {chapters.map((chapter) => {
        const locked = isChapterLocked(chapter);
        return (
          <Pressable
            key={chapter.id}
            onPress={() => onOpen(chapter)}
            style={{
              height: 220,
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: colors.surfaceSecondary,
            }}
          >
            <ChapterCoverCard chapter={chapter} />
            <ChapterCoverShimmer
              chapterId={chapter.id}
              viewedAt={chapter.viewed_at}
            />
            {locked ? <ChapterLockedOverlay /> : null}
            {!locked ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onShare(chapter);
                }}
                hitSlop={10}
                accessibilityLabel="Share chapter"
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: "rgba(0,0,0,0.45)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="share-outline" size={16} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}


