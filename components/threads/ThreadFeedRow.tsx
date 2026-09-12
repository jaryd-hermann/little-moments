import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { momentTitleStyle } from "@/lib/momentTypography";
import type { Thread } from "@/hooks/useThreads";
import { ThreadMomentCollage } from "@/components/threads/ThreadMomentCollage";
import { ThreadAnswerSheet } from "@/components/threads/ThreadAnswerSheet";
import {
  ThreadFeedbackSheet,
  ThreadFeedbackThumbButton,
} from "@/components/threads/ThreadFeedbackSheet";
import type { ThreadFeedbackSentiment } from "@/lib/threadFeedback";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { bevelShadow, PINK_CTA_INK } from "@/lib/themedShadow";
import {
  connectionDotColor,
  connectionTypeLabelUpper,
  threadQuestion,
  threadStatement,
  threadTimeGapLabel,
} from "@/lib/threadDisplay";

interface ThreadFeedRowProps {
  thread: Thread;
  locked?: boolean;
  /** Suppress bottom divider when the next row is a highlighted card. */
  nextHighlighted?: boolean;
  onAnswerSaved: (threadId: string, answer: string) => void;
  onFeedbackSubmitted: (
    threadId: string,
    patch: {
      hidden_from_feed: boolean;
      highlighted: boolean;
      feedback_sentiment: ThreadFeedbackSentiment;
    }
  ) => void;
}

export function ThreadFeedRow({
  thread,
  locked = false,
  nextHighlighted = false,
  onAnswerSaved,
  onFeedbackSubmitted,
}: ThreadFeedRowProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] =
    useState<ThreadFeedbackSentiment>("positive");

  const statement = threadStatement(thread);
  const question = threadQuestion(thread);
  const gap = threadTimeGapLabel(thread);
  const dotColor = connectionDotColor(thread.connection_type);
  const typeLabel = connectionTypeLabelUpper(thread.connection_type);
  const hasAnswer = !!thread.user_answer?.trim();

  const openDetail = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      launchPremiumFlow(posthog, "thread_feed_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
      return;
    }
    router.push(`/threads/${thread.id}`);
  };

  const openAnswer = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      launchPremiumFlow(posthog, "thread_feed_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
      return;
    }
    setAnswerSheetOpen(true);
  };

  const openFeedback = (sentiment: ThreadFeedbackSentiment) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      launchPremiumFlow(posthog, "thread_feed_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
      return;
    }
    setFeedbackSentiment(sentiment);
    setFeedbackSheetOpen(true);
  };

  const highlighted = thread.highlighted;
  const showBottomDivider = !highlighted && !nextHighlighted;

  const rowContent = (
    <View style={{ flexDirection: "row", gap: 14 }}>
      <View style={{ width: 86, alignItems: "center" }}>
        <ThreadMomentCollage thread={thread} />
        {gap ? (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {gap}
          </Text>
        ) : null}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotColor,
            }}
          />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 11,
              letterSpacing: 0.6,
              color: colors.textMuted,
            }}
          >
            {typeLabel}
          </Text>
        </View>

        <Text
          style={momentTitleStyle({
            fontSize: 16,
            lineHeight: 22,
            color: colors.text,
            marginBottom: 10,
          })}
        >
          {statement}
        </Text>

        {hasAnswer ? (
          <View
            style={{
              borderRadius: 12,
              backgroundColor: colors.primary,
              padding: 12,
              gap: 8,
            }}
          >
            {question ? (
              <Text
                style={{
                  fontFamily: "Roboto-Bold",
                  fontSize: 14,
                  lineHeight: 20,
                  color: PINK_CTA_INK,
                }}
              >
                {question}
              </Text>
            ) : null}
            <Text
              numberOfLines={2}
              ellipsizeMode="tail"
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                lineHeight: 20,
                color: PINK_CTA_INK,
              }}
            >
              {thread.user_answer}
            </Text>
          </View>
        ) : question ? (
          <View style={{ gap: 10 }}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                lineHeight: 20,
                color: colors.textSecondary,
              }}
            >
              {question}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Pressable
                onPress={openAnswer}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              >
                <Ionicons name="pencil" size={12} color="#1A1A1A" />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    color: "#1A1A1A",
                  }}
                >
                  Answer
                </Text>
              </Pressable>
              <ThreadFeedbackThumbButton
                emoji="👍"
                selected={thread.feedback_sentiment === "positive"}
                onPress={() => openFeedback("positive")}
              />
              <ThreadFeedbackThumbButton
                emoji="👎"
                selected={thread.feedback_sentiment === "negative"}
                onPress={() => openFeedback("negative")}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <>
      <Pressable
        onPress={openDetail}
        style={{
          paddingVertical: highlighted ? 0 : 18,
          marginVertical: highlighted ? 10 : 0,
          borderBottomWidth: showBottomDivider ? 1 : 0,
          borderBottomColor: colors.border,
          position: "relative",
        }}
      >
        {highlighted ? (
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1.5,
              borderColor: "#7B5EA7",
              backgroundColor: theme === "light" ? "#FFFFFF" : colors.surface,
              padding: 14,
              ...bevelShadow(theme),
            }}
          >
            {rowContent}
          </View>
        ) : (
          rowContent
        )}

        {locked ? (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: highlighted ? 16 : 0,
              backgroundColor: "rgba(255,255,255,0.72)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Pressable
              onPress={() => {
                launchPremiumFlow(posthog, "thread_feed_locked", {
                  bump: { surface: "thread", refId: thread.id },
                });
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: colors.primary,
              }}
            >
              <Ionicons name="lock-closed" size={14} color="#1A1A1A" />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: "#1A1A1A",
                }}
              >
                Upgrade to unlock
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>

      <ThreadAnswerSheet
        visible={answerSheetOpen}
        thread={thread}
        onClose={() => setAnswerSheetOpen(false)}
        onSaved={onAnswerSaved}
      />

      <ThreadFeedbackSheet
        visible={feedbackSheetOpen}
        thread={thread}
        sentiment={feedbackSentiment}
        onClose={() => setFeedbackSheetOpen(false)}
        onSubmitted={(threadId, patch) => {
          onFeedbackSubmitted(threadId, patch);
          if (patch.hidden_from_feed) {
            // Row will unmount from feed after parent state updates.
          }
        }}
      />
    </>
  );
}
