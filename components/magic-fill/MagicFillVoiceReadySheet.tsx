import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { useTheme } from "@/hooks/useTheme";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Phase = "countdown" | "go" | "hidden";

export interface MagicFillVoiceReadySheetProps {
  visible: boolean;
  onRecordingStart: () => void;
  onDismiss: () => void;
}

export function MagicFillVoiceReadySheet({
  visible,
  onRecordingStart,
  onDismiss,
}: MagicFillVoiceReadySheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("countdown");
  const [count, setCount] = useState(5);
  const startedRef = useRef(false);

  const beginRecording = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPhase("go");
    setTimeout(() => {
      onRecordingStart();
      onDismiss();
    }, 1000);
  }, [onDismiss, onRecordingStart]);

  useEffect(() => {
    if (!visible) {
      setPhase("countdown");
      setCount(5);
      startedRef.current = false;
      return;
    }
    if (phase !== "countdown") return;
    if (count <= 0) {
      beginRecording();
      return;
    }
    const t = setTimeout(() => {
      void Haptics.selectionAsync();
      setCount((c) => c - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [visible, phase, count, beginRecording]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onDismiss}>
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onPress={onDismiss}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: Math.max(insets.bottom, 24),
            alignItems: "center",
          }}
        >
          {phase === "countdown" ? (
            <>
              <Text
                style={magicFillHeadlineStyle({
                  fontSize: 72,
                  lineHeight: 80,
                  color: colors.text,
                  marginBottom: 16,
                })}
              >
                {count}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 16,
                  lineHeight: 24,
                  color: colors.textSecondary,
                  textAlign: "center",
                  marginBottom: 24,
                }}
              >
                Get ready to start speaking! Tap &quot;Next moment&quot; to move on
                and caption the next one when you&apos;re done.
              </Text>
              <MagicFillPrimaryButton
                label="Start now!"
                variant="pink"
                onPress={beginRecording}
                style={{ alignSelf: "stretch" }}
              />
            </>
          ) : (
            <Text
              style={magicFillHeadlineStyle({
                fontSize: 28,
                lineHeight: 34,
                color: colors.text,
                textAlign: "center",
              })}
            >
              And you&apos;re on! Have fun.
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
