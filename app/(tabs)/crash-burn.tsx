import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Alert, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
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
import { StoryViewer } from "@/components/today/StoryViewer";
import { MEMORY_JOG_SLIDES } from "@/constants/storySlides";
import { useTheme } from "@/hooks/useTheme";

type Phase = "pre-race" | "racing" | "post-race";
const RACE_DURATION = 120;

export default function CrashBurnScreen() {
  const { colors, theme } = useTheme();
  const { saveEntry } = useEntries();
  const user = useAuthStore((s) => s.user);

  const [phase, setPhase] = useState<Phase>("pre-race");
  const [word, setWord] = useState(getDailyWord());
  const [raceText, setRaceText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usedWords = useRef<Set<string>>(new Set([word]));

  const storyProgress = useSettingsStore((s) => s.storyProgress);
  const setStoryProgress = useSettingsStore((s) => s.setStoryProgress);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

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
    setPhase("racing");
    setRaceText("");
    setElapsedSeconds(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  };

  const finishRace = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setPhase("post-race");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handlePostAsIs = async () => {
    if (!user || !raceText.trim()) return;
    try {
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
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={colors.icon}
              />
            </Pressable>
          </View>

          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              HOW AND WHY
            </Text>
            <Pressable
              onPress={() => setShowStoryViewer(true)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 20,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 15,
                  color: colors.text,
                  flex: 1,
                }}
              >
                The story behind Memory Jog
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={colors.textSecondary}
                style={{ marginLeft: 12 }}
              />
            </Pressable>
          </View>

          <View style={{ marginTop: 24 }}>
            <WordCard word={word} onShuffle={handleShuffle} />
          </View>

          {/* Instructions card */}
          <View
            style={{
              marginTop: 24,
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
                fontSize: 14,
                color: colors.textSecondary,
                lineHeight: 24,
              }}
            >
              Write for 2 minutes without stopping. Don't edit. Don't
              think. Just let the words flow from your starting word.
              When time's up, you can save it raw or use AI to help
              refine it.
            </Text>
          </View>

          <Pressable
            onPress={startRace}
            style={{
              marginTop: 24,
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
              BEGIN RACE
            </Text>
          </Pressable>
        </ScrollView>

        <StoryViewer
          visible={showStoryViewer}
          onClose={(highest) => {
            setStoryProgress("memory_jog", highest);
            setShowStoryViewer(false);
          }}
          slides={MEMORY_JOG_SLIDES}
        />

        {/* Info Modal */}
        <Modal
          visible={showInfo}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowInfo(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                paddingVertical: 12,
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
                Memory Jog
              </Text>
              <Pressable onPress={() => setShowInfo(false)}>
                <Ionicons name="close" size={24} color={colors.icon} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={{ padding: 24 }}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 16,
                  color: colors.text,
                  lineHeight: 26,
                }}
              >
                Memory Jog is a timed free-writing exercise inspired by
                Matthew Dicks' storytelling techniques.
              </Text>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 16,
                  color: colors.text,
                  lineHeight: 26,
                  marginTop: 16,
                }}
              >
                You start with a random word and write for 2 minutes without
                stopping — no editing, no pausing, just letting your
                thoughts flow. The randomness unlocks buried memories you
                didn't know you had.
              </Text>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 16,
                  color: colors.text,
                  lineHeight: 26,
                  marginTop: 16,
                }}
              >
                When time's up, you can post your writing as-is or use Dig
                Deeper to refine it into a polished story. Both are
                valuable — the goal is to practice noticing and
                remembering.
              </Text>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  if (phase === "racing") {
    return (
      <SafeAreaView className="flex-1 bg-black px-5">
        <Text
          style={{
            fontFamily: "LibreBaskerville-Regular",
            fontSize: 18,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: 8,
          }}
        >
          {word}
        </Text>

        <View className="my-4">
          <RaceTimer
            isRunning={true}
            elapsedSeconds={elapsedSeconds}
            durationSeconds={RACE_DURATION}
          />
        </View>

        <View className="flex-1">
          <CrashBurnComposer
            text={raceText}
            onChangeText={setRaceText}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="mic"
              size={22}
              color={colors.icon}
            />
          </View>
          <Pressable
            onPress={finishRace}
            style={{
              flex: 1,
              height: 48,
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
              FINISH
            </Text>
          </Pressable>
        </View>
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
