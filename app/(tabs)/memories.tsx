import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { ListViewMemories } from "@/components/memories/ListViewMemories";
import { CapsuleFlipbookView } from "@/components/memories/CapsuleFlipbookView";
import { GridViewMemories } from "@/components/memories/GridViewMemories";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { ShareChapterModal } from "@/components/common/ShareChapterModal";
import { useEntries } from "@/hooks/useEntries";
import { useStreak } from "@/hooks/useStreak";
import { useTheme } from "@/hooks/useTheme";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import {
  toMarketingStoryListItems,
  resolveStoryProgress,
  resumeSlideIndexFromProgress,
} from "@/lib/marketingStories";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import type { ChapterRecord } from "@/lib/chapters";
import { chapterCardTitle, chapterWeekLabel } from "@/lib/chapters";
import type { Entry } from "@/store/entryStore";
import { CapsuleStatBar, type CapsuleFilter } from "@/components/memories/CapsuleStatBar";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";
import { CoreMemoryIcon } from "@/components/common/CoreMemoryIcon";
import { useThreads } from "@/hooks/useThreads";
import { useThreadDevStore, makeDummyThread } from "@/store/threadDevStore";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { yearCaptureProgress } from "@/lib/yearCapture";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";
import { DashedEmptyState } from "@/components/common/DashedEmptyState";
import { AppRatingPromptModal } from "@/components/common/AppRatingPromptModal";
import {
  hasFullPhotoLibraryAccess,
  useMediaLibrary,
} from "@/hooks/useMediaLibrary";

type ViewMode = "list" | "feed" | "grid";

const VIEW_MODE_ICONS: Record<ViewMode, keyof typeof Ionicons.glyphMap> = {
  grid: "grid-outline",
  list: "list-outline",
  feed: "albums-outline",
};

export default function MemoriesScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const { entries, fetchEntries } = useEntries();
  const { totalMoments } = useStreak();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [capsuleFilter, setCapsuleFilter] = useState<CapsuleFilter>("all");
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const pinnedOnly = useCapsuleFlipbookStore((s) => s.pinnedOnly);
  const setPinnedOnly = useCapsuleFlipbookStore((s) => s.setPinnedOnly);
  const togglePinnedOnly = useCapsuleFlipbookStore((s) => s.togglePinnedOnly);
  const {
    threads,
    fetchAllThreadsLightweight,
    isThreadLocked,
    stats,
    updateThreadAnswerLocal,
  } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

  const coreMomentCount = useMemo(
    () =>
      entries.filter((e) => e.entry_type === "moment" && e.is_pinned).length,
    [entries]
  );

  /**
   * Entering core-memory mode plays a short rise-and-fade over the whole
   * content area, so filtering down to core moments reads as a deliberate
   * shift rather than the list silently getting shorter. Leaving the mode
   * snaps back — the reveal is the part worth dramatising.
   */
  const coreReveal = useSharedValue(1);
  useEffect(() => {
    if (!pinnedOnly) {
      coreReveal.value = 1;
      return;
    }
    coreReveal.value = 0;
    coreReveal.value = withTiming(1, {
      duration: 460,
      easing: Easing.out(Easing.cubic),
    });
  }, [pinnedOnly, coreReveal]);

  const coreRevealStyle = useAnimatedStyle(() => ({
    opacity: coreReveal.value,
    transform: [
      { scale: 0.97 + coreReveal.value * 0.03 },
      { translateY: (1 - coreReveal.value) * 14 },
    ],
  }));

  const threadsForCapsule = useMemo(() => {
    if (__DEV__ && dummyThreadEnabled) {
      return [makeDummyThread(), ...threads];
    }
    return threads;
  }, [dummyThreadEnabled, threads]);
  const searchTrackedRef = useRef(false);
  const handleSearchQuery = useCallback((q: string) => {
    setSearchQuery(q);
    if (q.trim() && !searchTrackedRef.current) {
      searchTrackedRef.current = true;
      posthog.capture("capsule_search_used");
    }
  }, [posthog]);
  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const { permissionStatus, accessPrivileges, checkPermission } =
    useMediaLibrary();
  const hasPhotoAccess = hasFullPhotoLibraryAccess(
    permissionStatus,
    accessPrivileges
  );

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );
  const { philosophyStories, bySlug } = useMarketingStories();
  const philosophyListItems = useMemo(
    () => toMarketingStoryListItems(philosophyStories),
    [philosophyStories]
  );
  const [storyViewerSlug, setStoryViewerSlug] = useState<string | null>(null);
  const activeStorySlides = storyViewerSlug
    ? bySlug.get(storyViewerSlug)?.slides
    : undefined;
  const storyResumeSlideIndex = useMemo(() => {
    if (!storyViewerSlug || !activeStorySlides?.length) return 0;
    const p = resolveStoryProgress(storyViewerSlug, storyProgress);
    return resumeSlideIndexFromProgress(p, activeStorySlides.length);
  }, [storyViewerSlug, activeStorySlides, storyProgress]);

  const { chapters, fetchChapters, isChapterLocked } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapters = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapters() : []),
    [dummyEnabled]
  );
  const allChapters = useMemo(() => {
    const real = [...chapters];
    for (const dc of dummyChapters) {
      if (!real.find((c) => c.id === dc.id)) real.unshift(dc);
    }
    return real;
  }, [chapters, dummyChapters]);
  const chapterByIdMap = useMemo(() => {
    const m = new Map<string, ChapterRecord>();
    for (const c of allChapters) m.set(c.id, c);
    return m;
  }, [allChapters]);
  const [chapterViewerChapter, setChapterViewerChapter] = useState<ChapterRecord | null>(null);
  const [shareChapter, setShareChapter] = useState<ChapterRecord | null>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const view = useTabViewIntentStore.getState().consumeMemoriesView();
      if (view) setViewMode(view);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      const showRating =
        useTabViewIntentStore.getState().consumeMagicFillRatingPrompt();
      if (showRating) {
        setRatingModalVisible(true);
        posthog.capture("magic_fill_rating_prompt_shown");
      }
    }, [posthog])
  );

  useFocusEffect(
    useCallback(() => {
      if (filterParam === "core" || filterParam === "pinned") {
        setPinnedOnly(true);
      }
    }, [filterParam, setPinnedOnly])
  );

  useFocusEffect(
    useCallback(() => {
      posthog.capture("viewed_capsule", { entry_count: entries.length });
      searchTrackedRef.current = false;
      fetchEntries(undefined, { background: true });
    }, [fetchEntries, posthog, entries.length])
  );

  useEffect(() => {
    if (viewMode !== "list") return;
    fetchChapters();
    void fetchAllThreadsLightweight();
  }, [viewMode, fetchChapters, fetchAllThreadsLightweight]);

  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(false);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden])
  );

  const entriesWithDummyChapter = useMemo(() => {
    if (dummyChapters.length === 0) return entries;
    const fakeEntries: Entry[] = [];
    for (const dc of dummyChapters) {
      if (entries.some((e) => e.entry_type === "chapter" && e.chapter_id === dc.id)) continue;
      const startDate = dc.ref_week_start_date ?? `${dc.ref_year ?? new Date().getFullYear()}-01-01`;
      fakeEntries.push({
        id: `dummy-chapter-entry-${dc.id}`,
        user_id: dc.user_id,
        title: chapterCardTitle(dc),
        body: `Your ${chapterWeekLabel(dc) || "weekly"} chapter — ${dc.moment_count} moments captured.`,
        ai_enhanced_body: null,
        original_body: null,
        entry_type: "chapter",
        entry_date: startDate,
        entry_month: dc.ref_month ?? 1,
        entry_year: dc.ref_year ?? new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: null,
        ai_conversation: null,
        is_ai_enhanced: false,
        streak_day_number: null,
        chapter_id: dc.id,
        is_pinned: false,
        created_at: dc.created_at,
        updated_at: dc.updated_at,
      });
    }
    return [...fakeEntries, ...entries];
  }, [entries, dummyChapters]);

  const filteredEntries = useMemo(() => {
    let list = entriesWithDummyChapter;
    if (pinnedOnly) {
      list = list.filter(
        (e) => e.entry_type === "moment" && Boolean(e.is_pinned)
      );
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (e) =>
        (e.title?.toLowerCase().includes(q) ?? false) ||
        e.body.toLowerCase().includes(q)
    );
  }, [entriesWithDummyChapter, searchQuery, pinnedOnly]);

  /**
   * From the unfiltered list on purpose: this is a standing fact about their
   * year, so searching or filtering to core memories shouldn't move it.
   */
  const yearProgress = useMemo(() => yearCaptureProgress(entries), [entries]);

  const handleOpenStory = (slug: string) => {
    setStoryViewerSlug(slug);
  };

  const handleCloseStory = (highestSlide: number) => {
    if (storyViewerSlug) {
      setStoryProgress(storyViewerSlug, highestSlide);
    }
    setStoryViewerSlug(null);
  };

  const isEmptyLibrary = entries.length === 0 && !searchQuery.trim();

  if (isEmptyLibrary) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <DashedEmptyState
          image={require("@/assets/images/capsule.png")}
          imageAspectRatio={896 / 805}
          title="Your Capsule starts here"
          subtitle="Capture your first moment to see your Flipbook and saved archive of moments"
          singleLineTitle
          ctaLabel="Capture a moment"
          onCtaPress={() => router.replace("/(tabs)/today")}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        className="px-5 pt-2 pb-2"
        style={{
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
          }}
        >
          Capsule
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.surfaceSecondary,
              borderRadius: 9999,
              padding: 3,
            }}
          >
            {(["list", "grid", "feed"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mode === "feed") {
                    posthog.capture("capsule_flipbook_opened", {
                      entry_count: entries.length,
                    });
                  } else if (mode === "grid") {
                    posthog.capture("capsule_grid_opened", {
                      entry_count: entries.length,
                    });
                  }
                  setViewMode(mode);
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
                  name={VIEW_MODE_ICONS[mode]}
                  size={16}
                  color={
                    viewMode === mode
                      ? "#1A1A1A"
                      : colors.textMuted
                  }
                />
              </Pressable>
            ))}
          </View>
          {(coreMomentCount > 0 || pinnedOnly) && (
            <Pressable
              onPress={() => {
                if (pinnedOnly) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } else {
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  );
                }
                togglePinnedOnly();
              }}
              hitSlop={8}
              accessibilityLabel={
                pinnedOnly ? "Show all memories" : "Show core memories only"
              }
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CoreMemoryIcon size={32} active={pinnedOnly} />
            </Pressable>
          )}
          {viewMode === "list" && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSearchVisible((v) => !v);
              }}
              hitSlop={8}
              accessibilityLabel={searchVisible ? "Hide search" : "Show search"}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: searchVisible ? colors.surfaceSecondary : "transparent",
              }}
            >
              <Ionicons name="search" size={16} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      <Animated.View style={[{ flex: 1 }, coreRevealStyle]}>
      {viewMode === "feed" ? (
        <View style={{ flex: 1, paddingBottom: 100 }}>
          <CapsuleFlipbookView entries={filteredEntries} />
        </View>
      ) : viewMode === "grid" ? (
        <View style={{ flex: 1 }}>
          <GridViewMemories
            entries={filteredEntries}
            coreOnly={pinnedOnly}
            showMagicFillButton={hasPhotoAccess}
            onPressEntry={(entry) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              posthog.capture("capsule_grid_entry_tapped", {
                entry_id: entry.id,
                ymd: entry.entry_date,
              });
              router.push(`/entry/${entry.id}`);
            }}
            onPressEmptyDay={(ymd) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              posthog.capture("capsule_grid_empty_day_tapped", { ymd });
              router.push({ pathname: "/(tabs)/today", params: { day: ymd } });
            }}
          />
        </View>
      ) : (
        <View className="flex-1 px-5">
          <ListViewMemories
            entries={filteredEntries}
            searchQuery={searchQuery}
            onChangeQuery={handleSearchQuery}
            capsuleFilter={capsuleFilter}
            showSearch={searchVisible}
            showMagicFillButton={hasPhotoAccess}
            yearProgress={yearProgress}
            connectionsTabSeenAt={stats?.connections_tab_seen_at ?? null}
            onThreadAnswerSaved={updateThreadAnswerLocal}
            isChapterLockedById={(chapterId) => {
              const ch = chapterByIdMap.get(chapterId);
              return ch ? isChapterLocked(ch) : false;
            }}
            chapterById={(chapterId) => chapterByIdMap.get(chapterId)}
            onOpenChapter={(chapterId) => {
              const ch = chapterByIdMap.get(chapterId);
              if (!ch) return;
              // Free-tier paywalling: locked chapters route through the
              // `paywall` flag-aware entry so the A/B split is honored.
              if (isChapterLocked(ch)) {
                launchPremiumFlow(posthog, "memories_chapter_locked", {
                  bump: { surface: "chapter", refId: ch.id },
                });
                return;
              }
              setChapterViewerChapter(ch);
            }}
            threads={threadsForCapsule}
            isThreadLocked={(thread) =>
              isThreadLocked(
                thread,
                threadsForCapsule.findIndex((t) => t.id === thread.id)
              )
            }
          />
        </View>
      )}
      </Animated.View>

      <ChapterStoryViewer
        visible={!!chapterViewerChapter}
        chapter={chapterViewerChapter}
        onClose={() => setChapterViewerChapter(null)}
        onShare={(c) => {
          posthog.capture("chapter_share_tapped", {
            chapter_id: c.id,
            source: "chapter_completion_modal_capsule",
          });
          setChapterViewerChapter(null);
          setShareChapter(c);
        }}
      />

      <ShareChapterModal
        visible={!!shareChapter}
        chapter={shareChapter}
        onDismiss={() => setShareChapter(null)}
      />

      <AppRatingPromptModal
        visible={ratingModalVisible}
        onDismiss={() => setRatingModalVisible(false)}
      />
    </SafeAreaView>
  );
}
