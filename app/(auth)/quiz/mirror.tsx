import { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, ScrollView, StatusBar, Image } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import {
  buildMirrorLines,
  derivePersonaFromAnswers,
  deriveCaptureRhythmFromAnswers,
} from "@/lib/onboardingQuiz";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";

const WORDMARK_LIGHT_ON_DARK = require("@/assets/images/wordmark-little-moments.png");
const WORDMARK_DARK_ON_LIGHT = require("@/assets/images/wordmark-little-moments-black.png");

export default function QuizMirrorScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const answers = useOnboardingQuizStore((s) => s.answers);

  const mountedAtRef = useRef<number>(Date.now());
  const lines = useMemo(() => buildMirrorLines(answers), [answers]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
    posthog.capture(
      "quiz_completed",
      onboardingEventProps(0, {
        answer_count: Object.keys(answers).length,
        persona: derivePersonaFromAnswers(answers),
        capture_rhythm: deriveCaptureRhythmFromAnswers(answers),
      })
    );
  }, []);

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture(
      "quiz_mirror_continue",
      onboardingEventProps(0, {
        ms_on_screen: Date.now() - mountedAtRef.current,
      })
    );
    router.replace("/(auth)/sign-in");
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <Image
            source={
              theme === "dark" ? WORDMARK_LIGHT_ON_DARK : WORDMARK_DARK_ON_LIGHT
            }
            style={{ width: 200, height: 44 }}
            resizeMode="contain"
            accessibilityLabel="Little Moments"
          />
        </View>

        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            lineHeight: 34,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Got it. Here&apos;s what we&apos;re going to do for you.
        </Text>

        <View style={{ marginTop: 28, gap: 14 }}>
          {lines.map((line, i) => (
            <View
              key={i}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <View
                style={{
                  marginTop: 8,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Roboto-Regular",
                  fontSize: 16,
                  lineHeight: 24,
                  color: colors.text,
                }}
              >
                {line}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 24,
          backgroundColor: colors.background,
        }}
      >
        <Pressable
          accessibilityLabel="Continue"
          onPress={handleContinue}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
            ...bevelShadow(theme),
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: PINK_CTA_INK,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Continue
          </Text>
        </Pressable>
        <Text
          style={{
            marginTop: 12,
            fontFamily: "Roboto-Regular",
            fontSize: 12,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          Sign in next — your answers come with you.
        </Text>
      </View>
    </SafeAreaView>
  );
}
