import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { momentTitleStyle } from "@/lib/momentTypography";
import { connectionLabel } from "@/lib/threadOrdinal";
import { threadQuestion } from "@/lib/threadDisplay";
import { saveThreadAnswer } from "@/lib/threadAnswers";
import type { Thread } from "@/hooks/useThreads";

interface ThreadAnswerSheetProps {
  visible: boolean;
  thread: Thread | null;
  onClose: () => void;
  onSaved: (threadId: string, answer: string) => void;
}

export function ThreadAnswerSheet({
  visible,
  thread,
  onClose,
  onSaved,
}: ThreadAnswerSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && thread) {
      setAnswer(thread.user_answer ?? "");
    }
  }, [visible, thread]);

  const handleSave = useCallback(async () => {
    if (!thread || !answer.trim() || saving) return;
    setSaving(true);
    const wasEdit = !!thread.user_answer;
    const result = await saveThreadAnswer(thread.id, answer);
    setSaving(false);
    if (!result.ok) return;
    posthog.capture(wasEdit ? "thread_answer_edited" : "thread_answer_saved", {
      thread_id: thread.id,
      connection_type: thread.connection_type,
    });
    onSaved(thread.id, answer.trim());
    onClose();
  }, [thread, answer, saving, posthog, onSaved, onClose]);

  if (!thread) return null;
  const question = threadQuestion(thread);
  const typeLabel = connectionLabel(thread.connection_type);

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
              paddingTop: 16,
              paddingBottom: Math.max(insets.bottom, 20),
              maxHeight: "88%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <View
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: colors.surfaceSecondary,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    color: colors.text,
                  }}
                >
                  {typeLabel}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            {question ? (
              <Text
                style={momentTitleStyle({
                  fontSize: 16,
                  lineHeight: 22,
                  color: colors.text,
                  marginBottom: 16,
                })}
              >
                {question}
              </Text>
            ) : null}

            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 14,
                paddingTop: 12,
                paddingBottom: 10,
                minHeight: 140,
              }}
            >
              <TextInput
                value={answer}
                onChangeText={setAnswer}
                placeholder="Write your answer..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 16,
                  lineHeight: 24,
                  color: colors.text,
                  minHeight: 100,
                }}
              />
              <View style={{ alignItems: "flex-end", marginTop: 8 }}>
                <Pressable
                  onPress={() => void handleSave()}
                  disabled={!answer.trim() || saving}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 22,
                    borderRadius: 999,
                    backgroundColor: colors.primary,
                    opacity: !answer.trim() || saving ? 0.5 : 1,
                  }}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#1A1A1A" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: "Roboto-Medium",
                        fontSize: 14,
                        color: "#1A1A1A",
                      }}
                    >
                      Save
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
