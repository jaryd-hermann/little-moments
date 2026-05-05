import { Modal, View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ModalScrim } from "@/components/common/ModalScrim";
import { shareInvite } from "@/lib/inviteShare";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

interface ChapterCompleteModalProps {
  visible: boolean;
  chapterTitle: string;
  onDismiss: () => void;
}

export function ChapterCompleteModal({
  visible,
  chapterTitle,
  onDismiss,
}: ChapterCompleteModalProps) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <ModalScrim onPress={onDismiss} />
        <View
          style={{
            zIndex: 2,
            borderRadius: 20,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingTop: 44,
            paddingBottom: 28,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 8,
          }}
        >
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 36,
              height: 36,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>

          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 22,
              color: colors.text,
              lineHeight: 30,
              textAlign: "center",
            }}
          >
            {chapterTitle}
          </Text>

          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 16,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 12,
              lineHeight: 24,
            }}
          >
            Another week in the book.
          </Text>

          <View style={{ marginTop: 28, gap: 12 }}>
            <Pressable
              onPress={() => {
                onDismiss();
                router.push("/(tabs)/today?capture=1");
              }}
              style={{
                height: 48,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 1.5,
                borderColor: PINK_CTA_BORDER,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Capture another moment
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void shareInvite()}
              style={{
                height: 48,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: colors.text,
                  letterSpacing: 0.4,
                }}
              >
                Suggest to a friend
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
