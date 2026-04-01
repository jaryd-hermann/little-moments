import { useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  Image,
  useWindowDimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { differenceInDays, format } from "date-fns";
import { StreakBadge } from "./StreakBadge";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { StoryViewer } from "@/components/today/StoryViewer";
import { useTheme } from "@/hooks/useTheme";
import { useSettingsStore } from "@/store/settingsStore";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import {
  STREAK_PHILOSOPHY_SLUG,
  toMarketingStoryListItems,
  hasCompletedAllPhilosophyStories,
  resolveStoryProgress,
  resumeSlideIndexFromProgress,
} from "@/lib/marketingStories";

const WORDMARK_LIGHT_ON_DARK = require("@/assets/images/wordmark-little-moments.png");
const WORDMARK_DARK_ON_LIGHT = require("@/assets/images/wordmark-little-moments-black.png");
const STREAK_FLAME = require("@/assets/images/streak-flame.png");
const STORY_STARTER_BADGE = require("@/assets/images/story-starter-badge.png");

interface AppHeaderProps {
  streakCount: number;
  isAtRisk?: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  longestStreak?: number;
  totalMoments?: number;
  memoryRaceCount?: number;
  avgStoryLengthWords?: number;
  memberSince?: string | null;
}

export function AppHeader({
  streakCount,
  isAtRisk,
  displayName,
  avatarUrl,
  longestStreak = 0,
  totalMoments = 0,
  memoryRaceCount = 0,
  avgStoryLengthWords = 0,
  memberSince,
}: AppHeaderProps) {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [showStreak, setShowStreak] = useState(false);
  const [streakMarketingStoryOpen, setStreakMarketingStoryOpen] =
    useState(false);
  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const { philosophyStories, bySlug } = useMarketingStories();
  const streakStoryListItems = useMemo(() => {
    const row = philosophyStories.find((s) => s.slug === STREAK_PHILOSOPHY_SLUG);
    return row ? toMarketingStoryListItems([row]) : [];
  }, [philosophyStories]);
  const streakPhilosophySlides = bySlug.get(STREAK_PHILOSOPHY_SLUG)?.slides;
  const streakStoryResumeIndex = useMemo(() => {
    if (!streakPhilosophySlides?.length) return 0;
    const p = resolveStoryProgress(STREAK_PHILOSOPHY_SLUG, storyProgress);
    return resumeSlideIndexFromProgress(p, streakPhilosophySlides.length);
  }, [streakPhilosophySlides, storyProgress]);

  const hasFirstStory = totalMoments >= 1;
  const hasStoryFinderBadge = memoryRaceCount >= 1;
  const hasPhilosopherBadge = useMemo(
    () => hasCompletedAllPhilosophyStories(storyProgress, philosophyStories),
    [storyProgress, philosophyStories]
  );

  return (
    <>
      <View style={{ position: "relative", width: "100%" }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            source={
              theme === "dark"
                ? WORDMARK_LIGHT_ON_DARK
                : WORDMARK_DARK_ON_LIGHT
            }
            style={{ width: 132, height: 26, resizeMode: "contain" }}
            accessibilityLabel="Little Moments"
          />
        </View>

        <View
          className="flex-row items-center justify-between px-5 py-2"
          style={{ zIndex: 1 }}
        >
          <StreakBadge
            count={streakCount}
            totalMoments={totalMoments}
            isAtRisk={isAtRisk}
            onPress={() => setShowStreak(true)}
          />
          <Pressable
            onPress={() => router.push("/settings")}
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="menu" size={24} color={colors.icon} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={showStreak}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowStreak(false)}
      >
        <View
          style={{
            height: windowHeight,
            flex: 1,
            backgroundColor: colors.background,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: insets.top + 4,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 20,
                color: colors.text,
              }}
            >
              Your Moments
            </Text>
            <Pressable onPress={() => setShowStreak(false)}>
              <Ionicons name="close" size={24} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 24, alignItems: "center" }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginTop: 8,
              }}
            >
              <Image
                source={STREAK_FLAME}
                style={{ width: 64, height: 64 }}
                resizeMode="contain"
                accessibilityLabel="Streak"
              />
              <View>
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 44,
                    color: colors.text,
                  }}
                >
                  {streakCount}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 15,
                    color: colors.textSecondary,
                  }}
                >
                  day streak
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 16, marginTop: 32, width: "100%" }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {longestStreak}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Longest Streak
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {totalMoments}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Total Moments
                </Text>
              </View>
            </View>

            <View
              style={{ flexDirection: "row", gap: 16, marginTop: 16, width: "100%" }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {memoryRaceCount}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  Total Memory Races
                </Text>
              </View>
              <View
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {avgStoryLengthWords > 0 ? avgStoryLengthWords : "—"}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  Avg. story length
                </Text>
                {avgStoryLengthWords > 0 && (
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 11,
                      color: colors.textMuted,
                      marginTop: 2,
                      textAlign: "center",
                    }}
                  >
                    words per moment
                  </Text>
                )}
              </View>
            </View>

            {memberSince ? (
              <View
                style={{
                  marginTop: 16,
                  width: "100%",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 20,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: colors.text,
                  }}
                >
                  {Math.max(1, differenceInDays(new Date(), new Date(memberSince)) + 1)} days
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  Storyteller since {format(new Date(memberSince), "MMM d, yyyy")}
                </Text>
              </View>
            ) : null}

            {(hasFirstStory || hasStoryFinderBadge || hasPhilosopherBadge) && (
              <>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    color: colors.textMuted,
                    letterSpacing: 1.2,
                    alignSelf: "flex-start",
                    marginTop: 28,
                    marginBottom: 12,
                  }}
                >
                  BADGES
                </Text>
                {hasFirstStory && (
                  <View
                    style={{
                      marginBottom: 12,
                      width: "100%",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "18",
                      padding: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <ExpoImage
                      source={STORY_STARTER_BADGE}
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        backgroundColor: "transparent",
                      }}
                      contentFit="contain"
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 16,
                          color: colors.text,
                        }}
                      >
                        Story Starter!
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Roboto-Light",
                          fontSize: 13,
                          color: colors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        You posted your first moment. The journey begins.
                      </Text>
                    </View>
                  </View>
                )}
                {hasStoryFinderBadge && (
                  <View
                    style={{
                      marginBottom: 12,
                      width: "100%",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "18",
                      padding: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>🎯</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 16,
                          color: colors.text,
                        }}
                      >
                        Story finder
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Roboto-Light",
                          fontSize: 13,
                          color: colors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        You did your first memory race to find a story.
                      </Text>
                    </View>
                  </View>
                )}
                {hasPhilosopherBadge && (
                  <View
                    style={{
                      marginBottom: 12,
                      width: "100%",
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "18",
                      padding: 20,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <Text style={{ fontSize: 28 }}>📜</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 16,
                          color: colors.text,
                        }}
                      >
                        The Philosopher
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Roboto-Light",
                          fontSize: 13,
                          color: colors.textSecondary,
                          marginTop: 2,
                        }}
                      >
                        You cared to understand the how and why of little
                        moments.
                      </Text>
                    </View>
                  </View>
                )}
              </>
            )}

            <View style={{ width: "100%", marginTop: 24 }}>
              <MarketingStoryCard
                stories={streakStoryListItems}
                onPressStory={(_slug) => {
                  setShowStreak(false);
                  setTimeout(() => setStreakMarketingStoryOpen(true), 320);
                }}
                storyProgress={storyProgress}
                hideCompleted={false}
                sectionTitle="BUILD THE HABIT"
              />
            </View>

            {isAtRisk && (
              <View
                style={{
                  marginTop: 8,
                  width: "100%",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.warning,
                  backgroundColor: colors.warning + "18",
                  padding: 20,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 28 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: colors.text,
                    }}
                  >
                    Streak at risk!
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 13,
                      color: colors.textSecondary,
                      marginTop: 2,
                    }}
                  >
                    Add a moment today to keep it alive.
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      <StoryViewer
        visible={streakMarketingStoryOpen && Boolean(streakPhilosophySlides)}
        viewerKey={STREAK_PHILOSOPHY_SLUG}
        slides={streakPhilosophySlides}
        initialSlide={streakStoryResumeIndex}
        onClose={(highest) => {
          setStoryProgress(STREAK_PHILOSOPHY_SLUG, highest);
          setStreakMarketingStoryOpen(false);
        }}
      />
    </>
  );
}
