import { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { WRITING_PROMPTS } from "@/constants/prompts";
import { useTheme } from "@/hooks/useTheme";

interface PromptSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

function getRandomPrompts(count: number): string[] {
  const shuffled = [...WRITING_PROMPTS].sort(
    () => Math.random() - 0.5
  );
  return shuffled.slice(0, count);
}

export function PromptSheet({
  visible,
  onClose,
  onSelectPrompt,
}: PromptSheetProps) {
  const { colors } = useTheme();
  const [prompts, setPrompts] = useState(() =>
    getRandomPrompts(5)
  );

  const shuffle = () => {
    setPrompts(getRandomPrompts(5));
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0, 0, 0, 0.6)",
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 16,
          }}
          onPress={() => {}}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              marginBottom: 16,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 18,
                color: colors.text,
              }}
            >
              Writing Prompts
            </Text>
            <Pressable
              onPress={shuffle}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons
                name="shuffle"
                size={18}
                color={colors.primary}
              />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: colors.primary,
                  marginLeft: 4,
                }}
              >
                Shuffle
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            {prompts.map((prompt, index) => (
              <Pressable
                key={index}
                onPress={() => {
                  onSelectPrompt(prompt);
                  onClose();
                }}
                style={{
                  borderRadius: 12,
                  backgroundColor: colors.surfaceSecondary,
                  padding: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Regular",
                    fontSize: 15,
                    color: colors.textSecondary,
                    lineHeight: 22,
                  }}
                >
                  {prompt}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
