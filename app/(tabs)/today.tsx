import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { format, isSameDay } from "date-fns";
import { AppHeader } from "@/components/common/AppHeader";
import { DayStrip } from "@/components/today/DayStrip";
import { TodayEntryCard } from "@/components/today/TodayEntryCard";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { RecentMoments } from "@/components/today/RecentMoments";
import { useEntries } from "@/hooks/useEntries";
import { useStreak } from "@/hooks/useStreak";
import { useAuth } from "@/hooks/useAuth";
import { useEntryStore } from "@/store/entryStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTheme } from "@/hooks/useTheme";

export default function TodayScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { entries, fetchEntries } = useEntries();
  const { streakCount, isAtRisk, longestStreak, totalMoments } = useStreak();
  const selectedDate = useEntryStore((s) => s.selectedDate);
  const setSelectedDate = useEntryStore((s) => s.setSelectedDate);
  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
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

  const handleOpenStory = (storyIndex: number) => {
    setActiveStoryIndex(storyIndex);
    setShowStoryViewer(true);
  };

  const handleCloseStory = (highestSlide: number) => {
    setStoryProgress(activeStoryIndex, highestSlide);
    setShowStoryViewer(false);
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

        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textMuted,
            textAlign: "center",
            marginVertical: 12,
          }}
        >
          Your story so far: {totalMoments} moment{totalMoments !== 1 ? "s" : ""}
        </Text>

        <View className="mb-6">
          <TodayEntryCard
            entry={selectedEntry}
            selectedDate={selectedDate}
          />
        </View>

        <View className="mb-8">
          <MarketingStoryCard
            onPressStory={handleOpenStory}
            storyProgress={storyProgress}
            hideCompleted
          />
        </View>

        <View className="mb-8">
          <RecentMoments entries={recentEntries} />
        </View>

        <View style={{ gap: 12, marginBottom: 32 }}>
          <Pressable
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
        visible={showStoryViewer}
        onClose={handleCloseStory}
        storyIndex={activeStoryIndex}
      />
    </SafeAreaView>
  );
}
