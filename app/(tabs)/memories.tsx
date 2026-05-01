import { useState, useCallback, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { ListViewMemories } from "@/components/memories/ListViewMemories";
import { FlipbookMemories } from "@/components/memories/FlipbookMemories";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
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
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import type { ChapterRecord } from "@/lib/chapters";
import { chapterMonthName } from "@/lib/chapters";
import type { Entry } from "@/store/entryStore";
import { CapsuleStatBar, type CapsuleFilter } from "@/components/memories/CapsuleStatBar";
import { useThreads } from "@/hooks/useThreads";
import { useThreadDevStore, makeDummyThread } from "@/store/threadDevStore";

type ViewMode = "list" | "flipbook";

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries, fetchEntries } = useEntries();
  const { totalMoments } = useStreak();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const [viewMode, setViewMode] = useState<ViewMode>("flipbook");
  const [searchQuery, setSearchQuery] = useState("");
  const [capsuleFilter, setCapsuleFilter] = useState<CapsuleFilter>("all");
  const { totalConnections, threads, fetchAll: fetchThreadData } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

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

  const { chapters, fetchChapters } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapter = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapter() : null),
    [dummyEnabled]
  );
  const allChapters = useMemo(() => {
    const real = [...chapters];
    if (dummyChapter && !real.find((c) => c.id === dummyChapter.id)) {
      real.unshift(dummyChapter);
    }
    return real;
  }, [chapters, dummyChapter]);
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
      setTabBarHidden(viewMode === "flipbook");
      return () => setTabBarHidden(false);
    }, [viewMode, setTabBarHidden])
  );

  const entriesWithDummyChapter = useMemo(() => {
    if (!dummyChapter) return entries;
    const alreadyHasChapter = entries.some(
      (e) => e.entry_type === "chapter" && e.chapter_id === dummyChapter.id
    );
    if (alreadyHasChapter) return entries;
    const fakeEntry: Entry = {
      id: "dummy-chapter-entry",
      user_id: dummyChapter.user_id,
      title: `Chapter ${dummyChapter.chapter_number}: ${chapterMonthName(dummyChapter.ref_month)}`,
      body: `Your ${chapterMonthName(dummyChapter.ref_month)} ${dummyChapter.ref_year} chapter — ${dummyChapter.moment_count} moments captured.`,
      ai_enhanced_body: null,
      original_body: null,
      entry_type: "chapter",
      entry_date: `${dummyChapter.ref_year}-${String(dummyChapter.ref_month).padStart(2, "0")}-01`,
      entry_month: dummyChapter.ref_month,
      entry_year: dummyChapter.ref_year,
      date_precision: "month_only",
      word_of_day: null,
      ai_conversation: null,
      is_ai_enhanced: false,
      streak_day_number: null,
      chapter_id: dummyChapter.id,
      created_at: dummyChapter.created_at,
      updated_at: dummyChapter.updated_at,
    };
    return [fakeEntry, ...entries];
  }, [entries, dummyChapter]);

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

  if (viewMode === "flipbook") {
    return (
      <View style={{ flex: 1, backgroundColor: "#000000" }}>
        <FlipbookMemories
          entries={filteredEntries}
          onExitPress={() => setViewMode("list")}
        />
      </View>
    );
  }

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
            onPress={() => router.replace("/(tabs)/capture")}
            style={{
              marginTop: 20,
              height: 52,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: "#000000",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#000000",
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
        className="px-5 pt-2 pb-0"
        style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: colors.text,
          }}
        >
          Capsule
        </Text>
      </View>

      <View className="px-5">
        <CapsuleStatBar
          totalMoments={totalMoments}
          totalChapters={allChapters.length}
          totalThreads={totalConnections}
          activeFilter={capsuleFilter}
          onFilterChange={setCapsuleFilter}
        />
      </View>

      <View className="flex-1 px-5">
        <ListViewMemories
          entries={filteredEntries}
          searchQuery={searchQuery}
          onChangeQuery={handleSearchQuery}
          capsuleFilter={capsuleFilter}
          threads={threadsForCapsule}
          onOpenChapter={(chapterId) => {
            const ch = chapterByIdMap.get(chapterId);
            if (ch) setChapterViewerChapter(ch);
          }}
        />
      </View>

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
          posthog.capture("capsule_flipbook_opened", { entry_count: entries.length });
          setViewMode("flipbook");
        }}
        style={{
          position: "absolute",
          bottom: 120,
          right: 20,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: colors.text,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 28,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Ionicons name="swap-horizontal" size={16} color={colors.background} />
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 13,
            color: colors.background,
            letterSpacing: 0.3,
          }}
        >
          Flipbook
        </Text>
      </Pressable>

      <ChapterStoryViewer
        visible={!!chapterViewerChapter}
        chapter={chapterViewerChapter}
        onClose={() => setChapterViewerChapter(null)}
      />
    </SafeAreaView>
  );
}
