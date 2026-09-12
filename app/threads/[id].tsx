import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { momentTitleStyle } from "@/lib/momentTypography";
import { ThreadAnswerSheet } from "@/components/threads/ThreadAnswerSheet";
import {
  ThreadFeedbackSheet,
  ThreadFeedbackThumbButton,
} from "@/components/threads/ThreadFeedbackSheet";
import type { ThreadFeedbackSentiment } from "@/lib/threadFeedback";
import type { Thread, ThreadEntry } from "@/hooks/useThreads";
import {
  THREAD_DEV_PREVIEW_ID,
  makeDummyThread,
  useThreadDevStore,
} from "@/store/threadDevStore";
import { CONNECTION_LABELS } from "@/lib/threadOrdinal";
import {
  connectionDotColor,
  threadObservationBody,
  threadQuestion,
  threadStatement,
  threadTimeGapLabel,
  THREAD_PEACH_BG,
} from "@/lib/threadDisplay";
import { markThreadViewed } from "@/lib/views";
import { PINK_CTA_INK } from "@/lib/themedShadow";
import { EntryMomentSquarePreview } from "@/components/threads/EntryMomentSquarePreview";
import type { EntryMedia } from "@/store/entryStore";

function entryEffectiveDateString(entry: ThreadEntry): string | null {
  const taken = entry.media?.find((m) => m.taken_at)?.taken_at ?? null;
  return taken ?? entry.entry_date ?? null;
}

function isUsableMedia(
  m: NonNullable<ThreadEntry["media"]>[number]
): boolean {
  return Boolean(m.storage_url?.trim() || m.storage_path?.trim());
}

function threadEntryHeroMedia(
  entry: ThreadEntry
): EntryMedia | null {
  const raw = (entry.media ?? []).find(isUsableMedia);
  if (!raw) return null;
  const mediaType = (raw.media_type ?? "").toLowerCase().startsWith("video")
    ? "video"
    : "image";
  return {
    id: raw.id,
    entry_id: entry.id,
    user_id: "",
    storage_path: raw.storage_path?.trim() ?? "",
    storage_url: raw.storage_url,
    media_type: mediaType,
    display_order: 0,
    created_at: entry.created_at,
    taken_at: raw.taken_at,
    paired_video_storage_path: raw.paired_video_storage_path,
    paired_video_storage_url: raw.paired_video_storage_url,
  };
}

function MomentCard({ entry }: { entry: ThreadEntry }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const thumbSize = width - 40;
  const effectiveDate = entryEffectiveDateString(entry);
  const dateStr = effectiveDate
    ? format(new Date(effectiveDate), "MMMM d, yyyy")
    : "";
  const heroMedia = threadEntryHeroMedia(entry);

  return (
    <View style={{ marginBottom: 14 }}>
      {heroMedia ? (
        <View style={{ marginBottom: 10, alignSelf: "flex-start" }}>
          <EntryMomentSquarePreview media={heroMedia} size={thumbSize} />
        </View>
      ) : null}
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 12,
          color: colors.textMuted,
          marginBottom: 4,
        }}
      >
        {dateStr}
      </Text>
      {entry.title ? (
        <Text
          style={momentTitleStyle({
            fontSize: 16,
            color: colors.text,
          })}
        >
          {entry.title}
        </Text>
      ) : null}
    </View>
  );
}

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const posthog = usePostHog();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);
  const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
  const [feedbackSentiment, setFeedbackSentiment] =
    useState<ThreadFeedbackSentiment>("positive");

  useEffect(() => {
    if (!id) return;

    if (
      __DEV__ &&
      id === THREAD_DEV_PREVIEW_ID &&
      useThreadDevStore.getState().dummyThreadEnabled
    ) {
      setThread(makeDummyThread());
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("threads")
        .select(
          `
          *,
          entry_a:entries!threads_entry_id_a_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, storage_path, media_type, taken_at, paired_video_storage_path, paired_video_storage_url)),
          entry_b:entries!threads_entry_id_b_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, storage_path, media_type, taken_at, paired_video_storage_path, paired_video_storage_url))
        `
        )
        .eq("id", id)
        .single();

      if (data) {
        const mapped: Thread = {
          ...data,
          statement: (data as { statement?: string | null }).statement ?? null,
          question: (data as { question?: string | null }).question ?? null,
          user_answer: (data as { user_answer?: string | null }).user_answer ?? null,
          answered_at: (data as { answered_at?: string | null }).answered_at ?? null,
          hidden_from_feed:
            (data as { hidden_from_feed?: boolean }).hidden_from_feed ?? false,
          highlighted: (data as { highlighted?: boolean }).highlighted ?? false,
          feedback_sentiment:
            (data as { feedback_sentiment?: "positive" | "negative" | null })
              .feedback_sentiment ?? null,
          questions: (data.questions as string[]) ?? [],
          viewed_at: (data as { viewed_at?: string | null }).viewed_at ?? null,
          chronological_index:
            Number((data as { chronological_index?: number }).chronological_index) ||
            0,
          entry_a: data.entry_a
            ? { ...data.entry_a, media: data.entry_a.entry_media ?? [] }
            : null,
          entry_b: data.entry_b
            ? { ...data.entry_b, media: data.entry_b.entry_media ?? [] }
            : null,
        };
        setThread(mapped);

        if (mapped.viewed_at == null) {
          void markThreadViewed({
            threadId: mapped.id,
            posthog,
            connectionType: mapped.connection_type,
            createdAt: mapped.created_at,
          });
          setThread((prev) =>
            prev ? { ...prev, viewed_at: new Date().toISOString() } : prev
          );
        }
      } else {
        setThread(null);
      }
      setLoading(false);
    })();
  }, [id, posthog]);

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!thread) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}
      >
        <Text style={{ color: colors.textSecondary }}>Thread not found.</Text>
      </SafeAreaView>
    );
  }

  const typeBase = CONNECTION_LABELS[thread.connection_type] ?? "Thread";
  const typeTag = `${typeBase} thread`;
  const gap = threadTimeGapLabel(thread);
  const statement = threadStatement(thread);
  const question = threadQuestion(thread);
  const hasAnswer = !!thread.user_answer?.trim();
  const dotColor = connectionDotColor(thread.connection_type);
  const observationBody = threadObservationBody(thread.ellie_observation);

  const insightTextStyle = {
    fontFamily: "Roboto-Regular" as const,
    fontSize: 15,
    lineHeight: 24,
    color: "#1A1A1A",
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 48,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
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
              fontSize: 12,
              letterSpacing: 0.5,
              color: colors.textMuted,
            }}
          >
            {typeTag.toUpperCase()}
          </Text>
          {gap ? (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 12,
                color: colors.textMuted,
              }}
            >
              · {gap}
            </Text>
          ) : null}
        </View>

        <Text
          style={momentTitleStyle({
            fontSize: 20,
            lineHeight: 26,
            color: colors.text,
            marginBottom: 16,
          })}
        >
          {statement}
        </Text>

        {observationBody ? (
          <View
            style={{
              backgroundColor: THREAD_PEACH_BG,
              borderRadius: 20,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <Text style={insightTextStyle}>{observationBody}</Text>
          </View>
        ) : null}

        {question ? (
          hasAnswer ? (
            <View
              style={{
                borderRadius: 16,
                backgroundColor: colors.primary,
                padding: 16,
                marginBottom: 20,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Roboto-Bold",
                    fontSize: 14,
                    lineHeight: 20,
                    color: PINK_CTA_INK,
                  }}
                >
                  {question}
                </Text>
                <Pressable onPress={() => setAnswerSheetOpen(true)} hitSlop={8}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 13,
                      color: PINK_CTA_INK,
                    }}
                  >
                    Edit
                  </Text>
                </Pressable>
              </View>
              <Text
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
          ) : (
            <Pressable
              onPress={() => setAnswerSheetOpen(true)}
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: 16,
                marginBottom: 20,
              }}
            >
              <Text
                style={momentTitleStyle({
                  fontSize: 16,
                  lineHeight: 22,
                  color: colors.text,
                  marginBottom: 12,
                })}
              >
                {question}
              </Text>
              <View
                style={{
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              >
                <Ionicons name="pencil" size={14} color="#1A1A1A" />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 13,
                    color: "#1A1A1A",
                  }}
                >
                  Answer
                </Text>
              </View>
            </Pressable>
          )
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: colors.textMuted,
              marginRight: 4,
            }}
          >
            Was this interesting?
          </Text>
          <ThreadFeedbackThumbButton
            emoji="👍"
            selected={thread.feedback_sentiment === "positive"}
            onPress={() => {
              setFeedbackSentiment("positive");
              setFeedbackSheetOpen(true);
            }}
          />
          <ThreadFeedbackThumbButton
            emoji="👎"
            selected={thread.feedback_sentiment === "negative"}
            onPress={() => {
              setFeedbackSentiment("negative");
              setFeedbackSheetOpen(true);
            }}
          />
          {thread.highlighted ? (
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                color: "#7B5EA7",
                marginLeft: 4,
              }}
            >
              ✦ Highlighted
            </Text>
          ) : null}
        </View>

        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0.3,
            marginBottom: 12,
          }}
        >
          Threaded between these moments
        </Text>

        {thread.entry_a ? <MomentCard entry={thread.entry_a} /> : null}
        {thread.entry_b ? <MomentCard entry={thread.entry_b} /> : null}

        <Pressable
          onPress={() => router.replace("/(tabs)/brain?tab=ellie")}
          style={{
            marginTop: 8,
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
            }}
          >
            All Threads
          </Text>
        </Pressable>
      </ScrollView>

      <ThreadAnswerSheet
        visible={answerSheetOpen}
        thread={thread}
        onClose={() => setAnswerSheetOpen(false)}
        onSaved={(threadId, answer) => {
          setThread((prev) =>
            prev
              ? {
                  ...prev,
                  user_answer: answer,
                  answered_at: new Date().toISOString(),
                }
              : prev
          );
        }}
      />

      <ThreadFeedbackSheet
        visible={feedbackSheetOpen}
        thread={thread}
        sentiment={feedbackSentiment}
        onClose={() => setFeedbackSheetOpen(false)}
        onSubmitted={(_threadId, patch) => {
          setThread((prev) => (prev ? { ...prev, ...patch } : prev));
          if (patch.hidden_from_feed) {
            router.back();
          }
        }}
      />
    </SafeAreaView>
  );
}
