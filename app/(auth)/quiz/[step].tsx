import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { QUIZ_TOTAL_STEPS, quizQuestionByIndex } from "@/lib/onboardingQuiz";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";

const SELECTED_BG = "#FEEEB1";
const SELECTED_FG = "#000000";
const SELECTED_BORDER = "rgba(0,0,0,0.14)";

export default function QuizStepScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const params = useLocalSearchParams<{ step?: string }>();
  const stepIndex = Math.max(
    1,
    Math.min(QUIZ_TOTAL_STEPS, Number(params.step ?? "1") || 1)
  );
  const question = useMemo(() => quizQuestionByIndex(stepIndex), [stepIndex]);

  const answers = useOnboardingQuizStore((s) => s.answers);
  const setAnswer = useOnboardingQuizStore((s) => s.setAnswer);
  const setFurthestStep = useOnboardingQuizStore((s) => s.setFurthestStep);

  const [pendingOptionId, setPendingOptionId] = useState<string | null>(
    question ? (answers[question.id] ?? null) : null
  );
  const [submitting, setSubmitting] = useState(false);
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!question) return;
    mountedAtRef.current = Date.now();
    setPendingOptionId(answers[question.id] ?? null);
    setFurthestStep(stepIndex);
    if (stepIndex === 1) {
      posthog.capture("quiz_started", onboardingEventProps(0));
    }
    posthog.capture(
      "quiz_question_viewed",
      onboardingEventProps(0, {
        question_id: question.id,
        step_index: stepIndex,
      })
    );
  }, [stepIndex, question?.id]);

  if (!question) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const handleSelect = (optionId: string) => {
    void Haptics.selectionAsync();
    setPendingOptionId(optionId);
  };

  const handleContinue = async () => {
    if (!pendingOptionId || submitting) return;
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAnswer(question.id, pendingOptionId);
    const msOnScreen = Date.now() - mountedAtRef.current;
    posthog.capture(
      "quiz_question_answered",
      onboardingEventProps(0, {
        question_id: question.id,
        option_id: pendingOptionId,
        step_index: stepIndex,
        ms_on_screen: msOnScreen,
      })
    );
    if (stepIndex >= QUIZ_TOTAL_STEPS) {
      router.replace("/(auth)/quiz/mirror");
    } else {
      router.push(`/(auth)/quiz/${stepIndex + 1}`);
    }
    setSubmitting(false);
  };

  const handleBack = () => {
    if (stepIndex <= 1) {
      router.replace("/splash");
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/(auth)/quiz/${stepIndex - 1}`);
    }
  };

  const progress = stepIndex / QUIZ_TOTAL_STEPS;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <Pressable
          accessibilityLabel="Back"
          onPress={handleBack}
          hitSlop={10}
          style={{ paddingVertical: 6, paddingHorizontal: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <View
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.borderLight,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              backgroundColor: colors.primary,
            }}
          />
        </View>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 12,
            color: colors.textMuted,
            letterSpacing: 0.5,
            minWidth: 32,
            textAlign: "right",
          }}
        >
          {stepIndex}/{QUIZ_TOTAL_STEPS}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 24,
            lineHeight: 32,
            color: colors.text,
          }}
        >
          {question.prompt}
        </Text>
        {question.context ? (
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 22,
              color: colors.textSecondary,
              marginTop: 10,
            }}
          >
            {question.context}
          </Text>
        ) : null}

        <View style={{ marginTop: 28, gap: 12 }}>
          {question.options.map((opt) => {
            const selected = pendingOptionId === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => handleSelect(opt.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={{
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: selected ? SELECTED_BORDER : colors.border,
                  backgroundColor: selected ? SELECTED_BG : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: selected ? SELECTED_FG : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: SELECTED_FG,
                      }}
                    />
                  ) : null}
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Roboto-Regular",
                    fontSize: 15,
                    lineHeight: 22,
                    color: selected ? SELECTED_FG : colors.text,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
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
          onPress={() => void handleContinue()}
          disabled={!pendingOptionId || submitting}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
            opacity: !pendingOptionId || submitting ? 0.5 : 1,
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
      </View>
    </SafeAreaView>
  );
}
