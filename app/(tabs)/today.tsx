import { useState, useCallback, useMemo } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format, isSameDay } from "date-fns";
import { AppHeader } from "@/components/common/AppHeader";
import { DayStrip } from "@/components/today/DayStrip";
import { TodayEntryCard } from "@/components/today/TodayEntryCard";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { ChapterCard } from "@/components/today/ChapterCard";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { RecentMoments } from "@/components/today/RecentMoments";
import { AskAiExplainerCard } from "@/components/today/AskAiExplainerCard";
import { useEntries } from "@/hooks/useEntries";
import { useStreak } from "@/hooks/useStreak";
import { useAuth } from "@/hooks/useAuth";
import { useEntryStore } from "@/store/entryStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTheme } from "@/hooks/useTheme";
import { shareInvite } from "@/lib/inviteShare";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import {
  toMarketingStoryListItems,
  resolveStoryProgress,
  resumeSlideIndexFromProgress,
} from "@/lib/marketingStories";
import { useChapters } from "@/hooks/useChapters";
import { useChapterDevStore } from "@/store/chapterStore";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { useDraftStore } from "@/store/draftStore";
import { DraftCard } from "@/components/today/DraftCard";

export default function TodayScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const posthog = usePostHog();
  const { entries, fetchEntries } = useEntries();
  const {
    streakCount,
    isAtRisk,
    longestStreak,
    totalMoments,
    memoryRaceCount,
    avgStoryLengthWords,
  } = useStreak();
  const selectedDate = useEntryStore((s) => s.selectedDate);
  const setSelectedDate = useEntryStore((s) => s.setSelectedDate);
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

  const { latestChapter, fetchChapters } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapter = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapter() : null),
    [dummyEnabled]
  );
  const activeChapter = latestChapter ?? dummyChapter;
  const [chapterViewerOpen, setChapterViewerOpen] = useState(false);

  const selectedDateKey = format(selectedDate, "yyyy-MM-dd");
  const drafts = useDraftStore((s) => s.drafts);
  const draft = drafts[selectedDateKey] ?? null;

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
      fetchChapters();

      const pendingId = useChapterNotifStore.getState().consume();
      if (pendingId && activeChapter?.id === pendingId) {
        setChapterViewerOpen(true);
      }
    }, [fetchEntries, fetchChapters, activeChapter?.id])
  );

  const entryDates = entries
    .filter((e) => e.entry_date)
    .map((e) => e.entry_date!);

  const selectedEntry =
    entries.find(
      (e) =>
        e.entry_date &&
        e.entry_date === format(selectedDate, "yyyy-MM-dd")
    ) ?? null;

  const recentEntries = entries.filter(
    (e) =>
      e.entry_date &&
      !isSameDay(new Date(e.entry_date), new Date())
  );

  const momentCount = entries.filter(
    (e) => e.entry_type === "moment"
  ).length;

  const handleOpenStory = (slug: string) => {
    setStoryViewerSlug(slug);
  };

  const handleCloseStory = (highestSlide: number) => {
    if (storyViewerSlug) {
      setStoryProgress(storyViewerSlug, highestSlide);
    }
    setStoryViewerSlug(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader
        streakCount={streakCount}
        isAtRisk={isAtRisk}
        displayName={profile?.display_name}
        avatarUrl={profile?.avatar_url}
        longestStreak={longestStreak}
        totalMoments={totalMoments}
        memoryRaceCount={memoryRaceCount}
        avgStoryLengthWords={avgStoryLengthWords}
        memberSince={profile?.created_at}
      />

      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <DayStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          entryDates={entryDates}
        />

        {draft && !selectedEntry && (
          <View className="mt-8 mb-2">
            <DraftCard draft={draft} dateKey={selectedDateKey} />
          </View>
        )}

        <View className={draft && !selectedEntry ? "mt-2 mb-6" : "mt-8 mb-6"}>
          <TodayEntryCard
            entry={selectedEntry}
            selectedDate={selectedDate}
            hasDraft={!!draft}
          />
        </View>

        {activeChapter && (
          <View className="mb-8">
            <ChapterCard
              chapter={activeChapter}
              onPress={() => setChapterViewerOpen(true)}
            />
          </View>
        )}

        <View className="mb-8">
          <MarketingStoryCard
            stories={philosophyListItems}
            onPressStory={handleOpenStory}
            storyProgress={storyProgress}
            hideCompleted
          />
        </View>

        <View className="mb-8">
          <RecentMoments entries={recentEntries} />
        </View>

        {momentCount < 3 ? <AskAiExplainerCard /> : null}

        <View style={{ gap: 12, marginBottom: 32 }}>
          <Pressable
            onPress={() => void shareInvite()}
            style={{
              height: 52,
              borderRadius: 9999,
              borderWidth: 1.5,
              borderColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              INVITE A FRIEND
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              posthog.capture("feedback_button_pressed", { source: "today" });
            }}
            style={{
              height: 52,
              borderRadius: 9999,
              borderWidth: 1.5,
              borderColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              SHARE FEEDBACK
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <StoryViewer
        visible={Boolean(activeStorySlides)}
        viewerKey={storyViewerSlug ?? ""}
        slides={activeStorySlides}
        initialSlide={storyResumeSlideIndex}
        onClose={handleCloseStory}
      />

      <ChapterStoryViewer
        visible={chapterViewerOpen && !!activeChapter}
        chapter={activeChapter}
        onClose={() => setChapterViewerOpen(false)}
      />
    </SafeAreaView>
  );
}
