import { EllieMessage } from "@/components/ellie/EllieMessage";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { UserMessage } from "@/components/ellie/UserMessage";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const CTA_LAVENDER = "#f0d7ff";
const OUTLINE_BORDER = "#F0D7FF";
/** Bold highlight for Capsule / Chapters / Threads on activation closing */
const BOLD_FEATURE_HIGHLIGHT = "#FECFB4";
/** Bold color for the understanding question */
const BOLD_QUESTION = "#FFA946";
const FEEDBACK_BUTTONS_BOTTOM_GAP = 36;
const ELLIE_AFTER_CHOICE_TOP_GAP = 20;

export type ActivationUnderstanding = "yes" | "kind_of" | "no";

type IntroStep =
  | { kind: "typing"; ms: number }
  | { kind: "msg"; key: string };

const INTRO_SCRIPT: IntroStep[] = [
  { kind: "typing", ms: 3000 },
  { kind: "msg", key: "m0" },
  { kind: "typing", ms: 3000 },
  { kind: "msg", key: "m1" },
  { kind: "typing", ms: 2000 },
  { kind: "msg", key: "m2" },
  { kind: "typing", ms: 3000 },
  { kind: "msg", key: "m3" },
  { kind: "typing", ms: 3000 },
  { kind: "msg", key: "m4" },
  { kind: "typing", ms: 1000 },
  { kind: "msg", key: "question" },
];

type QaTopicId =
  | "two_minutes"
  | "word_of_day"
  | "photo_of_day"
  | "go_deeper"
  | "multiple_per_day"
  | "pricing";

const QA_TOPICS: { id: QaTopicId; label: string }[] = [
  { id: "two_minutes", label: "Explain the 2 minutes to me" },
  { id: "word_of_day", label: "Explain the Word of the day again" },
  { id: "photo_of_day", label: "Explain the Photo of the day again" },
  { id: "go_deeper", label: 'What is "Go Deeper"?' },
  { id: "multiple_per_day", label: "Can I capture more than one moment a day?" },
  { id: "pricing", label: "Is this free...what's the price?" },
];

function qaAnswer(id: QaTopicId): string {
  switch (id) {
    case "two_minutes":
      return (
        "The timer means you have **up to two minutes** if you want it — but plenty of moments are just a sentence or two and only take a few seconds. " +
        "Short and sweet totally counts."
      );
    case "word_of_day":
      return (
        "**Word of the day** is the **same word for everyone** on **Today** each day — a shared starting point. " +
        "It's a **trigger for association**: it removes the blank page and helps a memory or story bubble up. " +
        "Speak or write freely; it's not about polish, just what the word unlocks for you."
      );
    case "photo_of_day":
      return (
        "**Photo of the day** is another starting point on **Today**: a photo from your library (when you allow access). Talk about what you remember when you see it — same idea as the word, different trigger."
      );
    case "go_deeper":
      return (
        "**Go Deeper** is an optional extra after you've shared a moment: Ellie asks a follow-up so you can add a bit more detail if you feel like it. You can skip it anytime."
      );
    case "multiple_per_day":
      return (
        "Yes. You can save **as many moments as you want** in a day. **Today** gives you one daily starting point, but you're not limited to a single capture."
      );
    case "pricing":
      return (
        "You can **capture moments for free** — the core habit stays accessible. **Premium** adds longer history in your **Capsule**, **Chapters**, and richer **Threads**. Tap premium or the paywall when you're ready for exact pricing."
      );
    default:
      return "";
  }
}

function buildIntroBodies(momentCount: number): Record<string, string> {
  const open =
    momentCount >= 2
      ? "You've already **Captured** two memories! These are now saved in your **Capsule**, a searchable and interactive archive of all your little moments."
      : "You've **Captured** a memory! It's saved in your **Capsule** — a searchable and interactive archive that will grow with every moment you add.";

  return {
    m0: open,
    m1:
      "At the end of each month, I'll make and send you beautiful **Chapters** of your shared moments as part of your dynamic life story.",
    m2:
      "I'll also surprise you occasionally with things I call **Threads** — patterns and connections across your memories you might not expect.",
    m3:
      "The more you take just a minute or two to use Little Moments each day, the more you'll start to notice the little things in your life, feel more gratitude (despite us not being a gratitude journal), and cherish your **Capsule** of saved moments.",
    m4: 'Before we go inside the main app, just one question for you: **Do you feel like I helped you get what Little Moments does?**',
    question: "", // buttons only; text is in m4
  };
}

interface Props {
  momentCount: number;
  userId: string | undefined;
  onFinish: () => void | Promise<void>;
}

export function ActivationClosingChat({ momentCount, userId, onFinish }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const scrollRef = useRef<ScrollView>(null);
  const introBodies = buildIntroBodies(momentCount);

  const introBoldColors = useMemo(
    () => ({
      Captured: BOLD_FEATURE_HIGHLIGHT,
      Capsule: BOLD_FEATURE_HIGHLIGHT,
      Chapters: BOLD_FEATURE_HIGHLIGHT,
      Threads: BOLD_FEATURE_HIGHLIGHT,
      "Do you feel like I helped you get what Little Moments does?": BOLD_QUESTION,
    }),
    []
  );

  const qaBoldColors = useMemo(
    () => ({
      Capsule: BOLD_FEATURE_HIGHLIGHT,
      Chapters: BOLD_FEATURE_HIGHLIGHT,
      Threads: BOLD_FEATURE_HIGHLIGHT,
    }),
    []
  );

  const [introIndex, setIntroIndex] = useState(0);
  const [understanding, setUnderstanding] = useState<ActivationUnderstanding | null>(null);
  /** After kind_of / no: whether user opened Q&A */
  const [qaEntered, setQaEntered] = useState(false);
  const [answeredQa, setAnsweredQa] = useState<QaTopicId[]>([]);

  useEffect(() => {
    posthog.capture("activation_closing_viewed", { moment_count: momentCount });
  }, [momentCount, posthog]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [introIndex, understanding, qaEntered, answeredQa.length, scrollToEnd]);

  const persistUnderstanding = useCallback(
    async (value: ActivationUnderstanding) => {
      posthog.capture("activation_understanding_feedback", { response: value });
      if (userId) {
        await supabase
          .from("profiles")
          .update({ activation_lm_understanding: value })
          .eq("id", userId);
      }
    },
    [posthog, userId]
  );

  // Intro sequencer: typing → message → typing → …
  useEffect(() => {
    if (introIndex >= INTRO_SCRIPT.length) return;
    const step = INTRO_SCRIPT[introIndex];
    if (step.kind !== "typing") return;
    const t = setTimeout(() => setIntroIndex((i) => i + 1), step.ms);
    return () => clearTimeout(t);
  }, [introIndex]);

  useEffect(() => {
    if (introIndex >= INTRO_SCRIPT.length) return;
    const step = INTRO_SCRIPT[introIndex];
    if (step.kind !== "msg" || step.key === "question") return;
    const t = setTimeout(() => setIntroIndex((i) => i + 1), 80);
    return () => clearTimeout(t);
  }, [introIndex]);

  const visibleIntroKeys = new Set<string>();
  for (let i = 0; i <= introIndex && i < INTRO_SCRIPT.length; i++) {
    const s = INTRO_SCRIPT[i];
    if (s.kind === "msg" && s.key !== "question") visibleIntroKeys.add(s.key);
  }
  const onQuestionStep =
    introIndex < INTRO_SCRIPT.length &&
    INTRO_SCRIPT[introIndex].kind === "msg" &&
    INTRO_SCRIPT[introIndex].key === "question";
  const showIntroTyping =
    introIndex < INTRO_SCRIPT.length && INTRO_SCRIPT[introIndex].kind === "typing";

  const handleUnderstanding = async (value: ActivationUnderstanding) => {
    setUnderstanding(value);
    await persistUnderstanding(value);
  };

  const handleQaTopic = (id: QaTopicId) => {
    posthog.capture("activation_closing_qa_topic", { topic: id });
    setAnsweredQa((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleEnterQa = () => {
    posthog.capture("activation_closing_qa_opened");
    setQaEntered(true);
  };

  const handleFinishPress = () => {
    void onFinish();
  };

  const outlineButton = (
    label: string,
    onPress: () => void,
    key?: string,
    opts?: { faded?: boolean }
  ) => (
    <Pressable
      key={key}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        minHeight: 48,
        borderRadius: 9999,
        borderWidth: 2,
        borderColor: OUTLINE_BORDER,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 16,
        opacity: opts?.faded ? 0.38 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 15,
          color: colors.text,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const primaryCta = (label: string) => (
    <Pressable
      onPress={handleFinishPress}
      style={{
        height: 52,
        borderRadius: 9999,
        backgroundColor: CTA_LAVENDER,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 15,
          color: "#1A1A1A",
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  const remainingQa = QA_TOPICS.filter((t) => !answeredQa.includes(t.id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: qaEntered ? 100 : 40,
        }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
      >
        {(["m0", "m1", "m2", "m3", "m4"] as const).map((key) =>
          visibleIntroKeys.has(key) ? (
            <EllieMessage
              key={key}
              content={introBodies[key]}
              showAvatar
              boldColorMap={introBoldColors}
            />
          ) : null
        )}

        {showIntroTyping && (
          <View style={{ marginLeft: 38, marginBottom: 4 }}>
            <ThinkingDots />
          </View>
        )}

        {onQuestionStep && (
          <View style={{ gap: 12, marginTop: 4, marginBottom: FEEDBACK_BUTTONS_BOTTOM_GAP }}>
            {(
              [
                { id: "yes" as const, label: "Yes, great job! 😍" },
                { id: "kind_of" as const, label: "Kind of 🤔" },
                { id: "no" as const, label: "No, I'm confused 😢" },
              ] as const
            ).map(({ id, label }) =>
              outlineButton(
                label,
                () => void handleUnderstanding(id),
                id,
                {
                  faded: understanding != null && understanding !== id,
                }
              )
            )}
          </View>
        )}

        {understanding === "yes" && (
          <View style={{ marginTop: ELLIE_AFTER_CHOICE_TOP_GAP }}>
            <EllieMessage
              content="Love to hear that. Let's go to your Today page."
              showAvatar
            />
            <View style={{ marginTop: 8 }}>{primaryCta("Show me the full app")}</View>
          </View>
        )}

        {understanding && understanding !== "yes" && !qaEntered && (
          <View style={{ marginTop: ELLIE_AFTER_CHOICE_TOP_GAP }}>
            <EllieMessage
              content="Job not well done by me! Can I help answer any questions?"
              showAvatar
            />
            <View style={{ gap: 12, marginTop: 12, marginBottom: 8 }}>
              {outlineButton("Not now, let me explore the app", handleFinishPress, "explore")}
              {outlineButton("Yes, I have some questions", handleEnterQa, "questions")}
            </View>
          </View>
        )}

        {understanding && understanding !== "yes" && qaEntered && (
          <View style={{ marginTop: ELLIE_AFTER_CHOICE_TOP_GAP }}>
            <EllieMessage content="Of course, ask me anything." showAvatar />
            {answeredQa.map((id) => {
              const topic = QA_TOPICS.find((t) => t.id === id);
              if (!topic) return null;
              return (
                <View key={id}>
                  <UserMessage content={topic.label} />
                  <EllieMessage
                    content={qaAnswer(id)}
                    showAvatar
                    boldColorMap={qaBoldColors}
                  />
                </View>
              );
            })}
            {remainingQa.length > 0 && (
              <View style={{ gap: 10, marginTop: 4, marginBottom: 8 }}>
                {remainingQa.map((t) =>
                  outlineButton(t.label, () => handleQaTopic(t.id), t.id)
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {qaEntered && understanding && understanding !== "yes" && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: colors.background,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {primaryCta("Show me the full app")}
        </View>
      )}
    </View>
  );
}
