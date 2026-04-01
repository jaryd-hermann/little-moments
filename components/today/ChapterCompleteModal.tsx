import { Modal, View, Text, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalScrim } from "@/components/common/ModalScrim";
import { shareInvite, FEEDBACK_MAIL } from "@/lib/inviteShare";

const BG = "#FFFFEB";

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
            backgroundColor: BG,
            paddingHorizontal: 24,
            paddingTop: 44,
            paddingBottom: 28,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.08)",
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
            <Ionicons name="close" size={22} color="#1A1A1A" />
          </Pressable>

          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 22,
              color: "#1A1A1A",
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
              color: "rgba(0,0,0,0.65)",
              textAlign: "center",
              marginTop: 12,
              lineHeight: 24,
            }}
          >
            Another month in the book.
          </Text>

          <View style={{ marginTop: 28, gap: 12 }}>
            <Pressable
              onPress={() => void Linking.openURL(FEEDBACK_MAIL)}
              style={{
                height: 48,
                borderRadius: 9999,
                backgroundColor: "#1A1A1A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: "#FFFFFF",
                  letterSpacing: 0.6,
                }}
              >
                Leave feedback
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void shareInvite()}
              style={{
                height: 48,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: "rgba(0,0,0,0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: "#1A1A1A",
                  letterSpacing: 0.4,
                }}
              >
                Invite a friend
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
