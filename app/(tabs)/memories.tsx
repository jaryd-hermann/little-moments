import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { ListViewMemories } from "@/components/memories/ListViewMemories";
import { FlipbookMemories } from "@/components/memories/FlipbookMemories";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { useEntries } from "@/hooks/useEntries";
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
import { chapterMonthName } from "@/lib/chapters";
import type { Entry } from "@/store/entryStore";

type ViewMode = "list" | "flipbook";

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries, fetchEntries } = useEntries();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
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
      posthog.capture("viewed_memories");
      fetchEntries();
      fetchChapters();
    }, [fetchEntries, fetchChapters])
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
        <ScrollView
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: 8 }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 16,
              color: colors.textSecondary,
              lineHeight: 24,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            Your story is just beginning.
          </Text>
          <Pressable
            onPress={() => router.push("/composer")}
            style={{
              marginTop: 24,
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
              Add your first moment
            </Text>
          </Pressable>
          <View style={{ marginTop: 36 }}>
            <MarketingStoryCard
              stories={philosophyListItems}
              onPressStory={handleOpenStory}
              storyProgress={storyProgress}
              hideCompleted
            />
          </View>
        </ScrollView>
        <StoryViewer
          visible={Boolean(activeStorySlides)}
          viewerKey={storyViewerSlug ?? ""}
          slides={activeStorySlides}
          initialSlide={storyResumeSlideIndex}
          onClose={handleCloseStory}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="px-5 pt-2 pb-2">
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: colors.text,
            marginBottom: 8,
          }}
        >
          Capsule
        </Text>
      </View>

      <View className="flex-1 px-5">
        <ListViewMemories
          entries={filteredEntries}
          searchQuery={searchQuery}
          onChangeQuery={setSearchQuery}
          onOpenChapter={(chapterId) => {
            const ch = chapterByIdMap.get(chapterId);
            if (ch) setChapterViewerChapter(ch);
          }}
        />
      </View>

      <Pressable
        onPress={() => setViewMode("flipbook")}
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
