import { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { ListViewMemories } from "@/components/memories/ListViewMemories";
import { CapsuleFlipbookView } from "@/components/memories/CapsuleFlipbookView";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { useEntries } from "@/hooks/useEntries";
import { useStreak } from "@/hooks/useStreak";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import {
  toMarketingStoryListItems,
  resolveStoryProgress,
  resumeSlideIndexFromProgress,
} from "@/lib/marketingStories";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import type { ChapterRecord } from "@/lib/chapters";
import { chapterCardTitle, chapterWeekLabel } from "@/lib/chapters";
import type { Entry } from "@/store/entryStore";
import { CapsuleStatBar, type CapsuleFilter } from "@/components/memories/CapsuleStatBar";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";
import { ThumbtackIcon } from "@/components/common/ThumbtackIcon";
import { useThreads } from "@/hooks/useThreads";
import { useThreadDevStore, makeDummyThread } from "@/store/threadDevStore";
import { launchPremiumFlow } from "@/lib/premiumFlow";

type ViewMode = "list" | "flipbook";

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries, fetchEntries } = useEntries();
  const { totalMoments } = useStreak();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const [viewMode, setViewMode] = useState<ViewMode>("flipbook");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [capsuleFilter, setCapsuleFilter] = useState<CapsuleFilter>("all");
  const pinnedOnly = useCapsuleFlipbookStore((s) => s.pinnedOnly);
  const togglePinnedOnly = useCapsuleFlipbookStore((s) => s.togglePinnedOnly);
  const {
    totalConnections,
    threads,
    fetchAll: fetchThreadData,
    isThreadLocked,
  } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

  const pinnedMomentCount = useMemo(
    () =>
      entries.filter((e) => e.entry_type === "moment" && e.is_pinned).length,
    [entries]
  );

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

  useFocusEffect(
    useCallback(() => {
      posthog.capture("viewed_capsule", { entry_count: entries.length });
      searchTrackedRef.current = false;
      fetchEntries();
      fetchChapters();
      fetchThreadData();
    }, [fetchEntries, fetchChapters, fetchThreadData])
  );

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
    if (!searchQuery.trim()) return entriesWithDummyChapter;
    const q = searchQuery.toLowerCase();
    return entriesWithDummyChapter.filter(
      (e) =>
        (e.title?.toLowerCase().includes(q) ?? false) ||
        e.body.toLowerCase().includes(q)
    );
  }, [entriesWithDummyChapter, searchQuery]);

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
        <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
          <EllieMessage
            content={"This is where your captured moments will go!\n\nI'll build you a searchable archive of all your memories, and there's even a fun Flipbook view as your moments grow to scroll through your timeline.\n\nI'll also share the Threads across your stories I find with you here."}
            showAvatar
          />
          <Pressable
            onPress={() => router.replace("/(tabs)/today")}
            style={{
              marginTop: 20,
              height: 52,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.5,
              }}
            >
              Add first moment
            </Text>
          </Pressable>
        </View>
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
            {(["flipbook", "list"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (mode === "flipbook") {
                    posthog.capture("capsule_flipbook_opened", {
                      entry_count: entries.length,
                    });
                  }
                  setViewMode(mode);
                }}
                style={{
                  paddingVertical: 5,
                  paddingHorizontal: 12,
                  borderRadius: 9999,
                  backgroundColor:
                    viewMode === mode ? colors.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 11,
                    color: viewMode === mode ? colors.text : colors.textMuted,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {mode === "list" ? "List" : "Flipbook"}
                </Text>
              </Pressable>
            ))}
          </View>
          {(pinnedMomentCount > 0 || pinnedOnly) && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                togglePinnedOnly();
              }}
              hitSlop={8}
              accessibilityLabel={pinnedOnly ? "Show all" : "Show pinned only"}
              style={{
                width: 30,
                height: 30,
                borderRadius: 9999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pinnedOnly ? colors.primary : "transparent",
              }}
            >
              <ThumbtackIcon
                size={16}
                color={colors.text}
                weight={pinnedOnly ? "solid" : "regular"}
              />
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

      {viewMode === "flipbook" ? (
        <View style={{ flex: 1, paddingBottom: 100 }}>
          <CapsuleFlipbookView entries={filteredEntries} />
        </View>
      ) : (
        <View className="flex-1 px-5">
          <ListViewMemories
            entries={filteredEntries}
            searchQuery={searchQuery}
            onChangeQuery={handleSearchQuery}
            capsuleFilter={capsuleFilter}
            threads={threadsForCapsule}
            showSearch={searchVisible}
            isChapterLockedById={(chapterId) => {
              const ch = chapterByIdMap.get(chapterId);
              return ch ? isChapterLocked(ch) : false;
            }}
            // Dev dummy threads are always openable; otherwise the real
            // thread lock predicate decides. Index is unused inside
            // `isThreadLocked` today, so 0 is a safe placeholder.
            isThreadLocked={(thread) =>
              thread.id.startsWith("dummy-")
                ? false
                : isThreadLocked(thread, 0)
            }
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
          />
        </View>
      )}

      <ChapterStoryViewer
        visible={!!chapterViewerChapter}
        chapter={chapterViewerChapter}
        onClose={() => setChapterViewerChapter(null)}
      />
    </SafeAreaView>
  );
}
