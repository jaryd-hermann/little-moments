import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import {
  MagicFillPrimaryButton,
  MagicFillSparkleIcon,
} from "@/components/magic-fill/MagicFillPrimaryButton";
import type { Thread } from "@/hooks/useThreads";
import {
  threadFeedbackChipsForSentiment,
  type ThreadFeedbackAction,
  type ThreadFeedbackChipId,
  type ThreadFeedbackSentiment,
} from "@/lib/threadFeedback";
import { submitThreadFeedback } from "@/lib/threadFeedbackApi";
import { threadStatement, connectionDotColor } from "@/lib/threadDisplay";

interface ThreadFeedbackSheetProps {
  visible: boolean;
  thread: Thread | null;
  sentiment: ThreadFeedbackSentiment;
  onClose: () => void;
  onSubmitted: (
    threadId: string,
    patch: {
      hidden_from_feed: boolean;
      highlighted: boolean;
      feedback_sentiment: ThreadFeedbackSentiment;
    }
  ) => void;
}

export function ThreadFeedbackSheet({
  visible,
  thread,
  sentiment,
  onClose,
  onSubmitted,
}: ThreadFeedbackSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const [chips, setChips] = useState<ThreadFeedbackChipId[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setChips([]);
      setNote("");
    }
  }, [visible, sentiment, thread?.id]);

  const toggleChip = useCallback((id: ThreadFeedbackChipId) => {
    setChips((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }, []);

  const submit = useCallback(
    async (action: ThreadFeedbackAction) => {
      if (!thread || saving) return;
      setSaving(true);
      const result = await submitThreadFeedback({
        threadId: thread.id,
        sentiment,
        chips,
        note: note.trim() || undefined,
        action,
      });
      setSaving(false);
      if (!result.ok) return;

      posthog.capture("thread_feedback_submitted", {
        thread_id: thread.id,
        sentiment,
        action,
        chips,
        has_note: !!note.trim(),
      });

      onSubmitted(thread.id, {
        hidden_from_feed: result.hidden_from_feed ?? false,
        highlighted: result.highlighted ?? false,
        feedback_sentiment:
          result.feedback_sentiment ?? sentiment,
      });
      onClose();
    },
    [thread, saving, sentiment, chips, note, posthog, onSubmitted, onClose]
  );

  if (!thread) return null;

  const isPositive = sentiment === "positive";
  const chipOptions = threadFeedbackChipsForSentiment(sentiment);
  const statement = threadStatement(thread);
  const dotColor = connectionDotColor(thread.connection_type);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
          onPress={onClose}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 20),
              maxHeight: "90%",
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                marginBottom: 16,
              }}
            />

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Bold",
                    fontSize: 22,
                    lineHeight: 28,
                    color: colors.text,
                    flex: 1,
                    paddingRight: 12,
                  }}
                >
                  {isPositive ? "👍 Glad this one landed" : "👎 Not your kind of thread"}
                </Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: colors.surfaceSecondary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </View>
                </Pressable>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 8,
                  marginBottom: 20,
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: dotColor,
                    marginTop: 6,
                  }}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Roboto-Regular",
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.textSecondary,
                    fontStyle: "italic",
                  }}
                >
                  {statement}
                </Text>
              </View>

              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 10,
                  letterSpacing: 0.8,
                  color: colors.textMuted,
                  marginBottom: 10,
                }}
              >
                {isPositive ? "WHAT MADE IT LAND?" : "WHAT FELT OFF?"} · optional
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 16,
                }}
              >
                {chipOptions.map((chip) => {
                  const selected = chips.includes(chip.id);
                  return (
                    <Pressable
                      key={chip.id}
                      onPress={() => toggleChip(chip.id)}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: selected ? colors.text : colors.border,
                        backgroundColor: selected
                          ? colors.surfaceSecondary
                          : colors.background,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 13,
                          color: colors.text,
                        }}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  marginBottom: 16,
                  minHeight: 100,
                }}
              >
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  textAlignVertical="top"
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 15,
                    lineHeight: 22,
                    color: colors.text,
                    minHeight: 72,
                  }}
                />
              </View>

              {isPositive ? (
                <MagicFillPrimaryButton
                  label="Highlight thread"
                  onPress={() => void submit("highlighted")}
                  disabled={saving}
                  icon={<MagicFillSparkleIcon />}
                  style={{ marginBottom: 12 }}
                />
              ) : (
                <Pressable
                  onPress={() => void submit("hidden")}
                  disabled={saving}
                  style={{
                    height: 56,
                    borderRadius: 9999,
                    backgroundColor: colors.text,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 15,
                      color: colors.background,
                      letterSpacing: 0.6,
                    }}
                  >
                    Hide from feed
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => void submit("none")}
                disabled={saving}
                style={{ alignItems: "center", paddingVertical: 8 }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: colors.textMuted,
                  }}
                >
                  {isPositive ? "Just send feedback" : "Send feedback, keep in feed"}
                </Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Circular thumbs-up / thumbs-down affordance for feed + detail. */
export function ThreadFeedbackThumbButton({
  emoji,
  selected,
  onPress,
}: {
  emoji: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.border,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
    </Pressable>
  );
}
