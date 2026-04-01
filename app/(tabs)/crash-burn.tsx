import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { WordCard } from "@/components/crash-burn/WordCard";
import { RaceTimer } from "@/components/crash-burn/RaceTimer";
import { CrashBurnComposer } from "@/components/crash-burn/CrashBurnComposer";
import { CRASH_BURN_WORDS, getDailyWord } from "@/constants/words";
import { useEntries } from "@/hooks/useEntries";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { StoryViewer } from "@/components/today/StoryViewer";
import { MarketingStoryCard } from "@/components/today/MarketingStoryCard";
import { useTheme } from "@/hooks/useTheme";
import { useMarketingStories } from "@/hooks/useMarketingStories";
import {
  MEMORY_JOG_STORY_SLUG,
  resolveStoryProgress,
  resumeSlideIndexFromProgress,
} from "@/lib/marketingStories";
import { InfoTipModal } from "@/components/common/InfoTipModal";
import { takeDigDeeperPendingResult } from "@/lib/digDeeperReturn";

type Phase = "pre-race" | "racing" | "post-race";
const RACE_DURATION = 120;

export default function CrashBurnScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const { memoryJogStory } = useMarketingStories();
  const memoryJogSlides = memoryJogStory?.slides;
  const { saveEntry } = useEntries();
  const user = useAuthStore((s) => s.user);
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);

  const [phase, setPhase] = useState<Phase>("pre-race");
  const [word, setWord] = useState(getDailyWord());
  const [raceText, setRaceText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const raceFinishedRef = useRef(false);
  const usedWords = useRef<Set<string>>(new Set([word]));

  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const memoryJogCardItems = useMemo(() => {
    if (!memoryJogStory) return [];
    return [
      {
        slug: MEMORY_JOG_STORY_SLUG,
        title: "Amaze yourself with your memory",
        description: memoryJogStory.card_description,
        slideCount: memoryJogStory.slides.length,
      },
    ];
  }, [memoryJogStory]);

  const memoryJogResumeSlideIndex = useMemo(() => {
    if (!memoryJogSlides?.length) return 0;
    const p = resolveStoryProgress(MEMORY_JOG_STORY_SLUG, storyProgress);
    return resumeSlideIndexFromProgress(p, memoryJogSlides.length);
  }, [memoryJogSlides, storyProgress]);

  useFocusEffect(
    useCallback(() => {
      posthog.capture("viewed_memory_jog");
      const pending = takeDigDeeperPendingResult();
      if (!pending?.enhancedBody?.trim()) return;
      setRaceText(pending.enhancedBody.trim());
    }, [])
  );

  const handleShuffle = () => {
    const available = CRASH_BURN_WORDS.filter(
      (w) => !usedWords.current.has(w)
    );
    if (available.length === 0) {
      usedWords.current.clear();
    }
    const pool =
      available.length > 0 ? available : CRASH_BURN_WORDS;
    const next = pool[Math.floor(Math.random() * pool.length)];
    usedWords.current.add(next);
    setWord(next);
  };

  const startRace = () => {
    posthog.capture("started_memory_jog");
    raceFinishedRef.current = false;
    setPhase("racing");
    setRaceText("");
    setElapsedSeconds(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        if (next >= RACE_DURATION && !raceFinishedRef.current) {
          raceFinishedRef.current = true;
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          queueMicrotask(() => {
            setPhase("post-race");
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          });
        }
        return next;
      });
    }, 1000);
  };

  const quitRace = () => {
    raceFinishedRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("pre-race");
    setRaceText("");
    setElapsedSeconds(0);
  };

  const finishRaceEarly = () => {
    raceFinishedRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("post-race");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  useEffect(() => {
    setTabBarHidden(phase === "racing");
    return () => setTabBarHidden(false);
  }, [phase, setTabBarHidden]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTabBarHidden(false);
    };
  }, [setTabBarHidden]);

  const handlePostAsIs = async () => {
    if (!user || !raceText.trim()) return;
    try {
      posthog.capture("completed_memory_jog");
      await saveEntry({
        title: null,
        body: raceText.trim(),
        ai_enhanced_body: null,
        original_body: raceText.trim(),
        entry_type: "crash_and_burn",
        entry_date: format(new Date(), "yyyy-MM-dd"),
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: word,
        ai_conversation: null,
        is_ai_enhanced: false,
        streak_day_number: null,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPhase("pre-race");
    } catch {
      Alert.alert("Error", "Failed to save entry.");
    }
  };

  const handleDigDeeper = () => {
    router.push({
      pathname: "/dig-deeper",
      params: {
        title: `Memory Jog: ${word}`,
        body: raceText,
        isCrashAndBurn: "true",
      },
    });
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (phase === "pre-race") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          className="flex-1 px-5 pt-4"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 32,
                  color: colors.text,
                }}
              >
                Memory Jog
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 15,
                  color: colors.textSecondary,
                  marginTop: 4,
                }}
              >
                Start with a word. Don't stop.
              </Text>
            </View>
            <Pressable
              onPress={() => setShowInfo(true)}
              style={{ marginTop: 4 }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor:
                    theme === "dark"
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.08)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name="information-outline"
                  size={20}
                  color={
                    theme === "dark"
                      ? "rgba(255,255,255,0.85)"
                      : "rgba(0,0,0,0.55)"
                  }
                />
              </View>
            </Pressable>
          </View>

          {memoryJogCardItems.length > 0 ? (
            <View style={{ marginTop: 24 }}>
              <MarketingStoryCard
                stories={memoryJogCardItems}
                onPressStory={() => {
                  setShowStoryViewer(true);
                }}
                storyProgress={storyProgress}
                hideCompleted
                sectionTitle="HOW AND WHY"
              />
            </View>
          ) : null}

          <View style={{ marginTop: 24 }}>
            <WordCard word={word} onShuffle={handleShuffle} />
          </View>

          <Text
            style={{
              marginTop: 24,
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.textSecondary,
              lineHeight: 24,
            }}
          >
            Write for 2 minutes without stopping. Don't edit. Don't think.
            Just let the words flow from your starting word. When time's
            up, you can save it raw or use AI to help refine it.
          </Text>

          <Pressable
            onPress={startRace}
            style={{
              marginTop: 24,
              height: 52,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#000000",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              BEGIN RACE
            </Text>
          </Pressable>
        </ScrollView>

        <StoryViewer
          visible={showStoryViewer && Boolean(memoryJogSlides)}
          viewerKey={MEMORY_JOG_STORY_SLUG}
          slides={memoryJogSlides}
          initialSlide={memoryJogResumeSlideIndex}
          onClose={(highest) => {
            setStoryProgress(MEMORY_JOG_STORY_SLUG, highest);
            setShowStoryViewer(false);
          }}
        />

        <InfoTipModal
          visible={showInfo}
          onClose={() => setShowInfo(false)}
          title="Memory Jog"
          scrollable
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: "#333333",
              lineHeight: 22,
            }}
          >
            Memory Jog is a timed free-writing exercise inspired by Matthew
            Dicks&apos; storytelling techniques.
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: "#333333",
              lineHeight: 22,
              marginTop: 16,
            }}
          >
            You start with a random word and write for 2 minutes without stopping
            — no editing, no pausing, just letting your thoughts flow. The
            randomness unlocks buried memories you didn&apos;t know you had.
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: "#333333",
              lineHeight: 22,
              marginTop: 16,
            }}
          >
            When time&apos;s up, you can post your writing as-is or use Dig
            Deeper to refine it into a polished story. Both are valuable — the
            goal is to practice noticing and remembering.
          </Text>
        </InfoTipModal>
      </SafeAreaView>
    );
  }

  if (phase === "racing") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000000" }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 4 : 0}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginTop: 8,
                gap: 12,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Roboto-Regular",
                  fontSize: 16,
                  lineHeight: 24,
                  color: "rgba(255, 255, 255, 0.85)",
                }}
              >
                Start rambling about{" "}
                <Text style={{ fontFamily: "Roboto-Bold", color: "#FFFFFF" }}>
                  {word}
                </Text>
              </Text>
              <Pressable
                onPress={quitRace}
                hitSlop={10}
                style={{
                  padding: 4,
                }}
                accessibilityLabel="Quit race"
              >
                <Ionicons name="close" size={26} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={{ marginVertical: 16 }}>
              <RaceTimer
                isRunning={true}
                elapsedSeconds={elapsedSeconds}
                durationSeconds={RACE_DURATION}
              />
            </View>

            <View style={{ flex: 1, marginBottom: 8, minHeight: 0 }}>
              <CrashBurnComposer
                text={raceText}
                onChangeText={setRaceText}
                onFinishRace={finishRaceEarly}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View
            style={{
              borderRadius: 9999,
              backgroundColor: colors.surfaceSecondary,
              paddingHorizontal: 16,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 13,
                color: colors.textSecondary,
              }}
            >
              ⏱ {formatDuration(elapsedSeconds)} ·{" "}
              {raceText.split(/\s+/).filter(Boolean).length} words
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          YOUR RAW RACE
        </Text>

        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 16,
              color: colors.textSecondary,
              lineHeight: 28,
            }}
          >
            {raceText}
          </Text>
        </View>

        <View style={{ marginTop: 24, flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={handlePostAsIs}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
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
              POST AS-IS
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDigDeeper}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 9999,
              backgroundColor:
                theme === "dark" ? "#FFFFFF" : "#1A1A1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: theme === "dark" ? "#000000" : "#FFFFFF",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              DIG DEEPER
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setPhase("pre-race")}
          style={{ marginTop: 16, marginBottom: 32 }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            Discard and start over
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
