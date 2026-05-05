import { Modal, View, Text, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalScrim } from "@/components/common/ModalScrim";
import { shareInvite, FEEDBACK_MAIL } from "@/lib/inviteShare";
import { formatOrdinal } from "@/lib/ordinal";
import { useTheme } from "@/hooks/useTheme";

interface MomentCelebrationModalProps {
  visible: boolean;
  momentNumber: number | null;
  onDismiss: () => void;
}

export function MomentCelebrationModal({
  visible,
  momentNumber,
  onDismiss,
}: MomentCelebrationModalProps) {
  const { colors } = useTheme();
  const ordinal =
    momentNumber != null ? formatOrdinal(momentNumber) : "";
  const isFirstMoment = momentNumber === 1;

  return (
    <Modal
      visible={visible && momentNumber != null}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
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
            You added your{" "}
            <Text style={{ fontFamily: "LibreBaskerville-Bold" }}>
              {ordinal}
            </Text>{" "}
            moment
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
            {isFirstMoment
              ? "The journey begins."
              : "Your story is growing."}
          </Text>

          <View style={{ marginTop: 28, gap: 12 }}>
            <Pressable
              onPress={() => {
                void Linking.openURL(FEEDBACK_MAIL);
              }}
              style={{
                height: 48,
                borderRadius: 9999,
                backgroundColor: colors.text,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: colors.background,
                  letterSpacing: 0.6,
                }}
              >
                Leave feedback
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void shareInvite();
              }}
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
                Invite a friend
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
