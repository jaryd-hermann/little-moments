import { Modal, View, Text, Pressable, Linking, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ModalScrim } from "@/components/common/ModalScrim";
import { shareInvite, FEEDBACK_MAIL } from "@/lib/inviteShare";
import { formatOrdinal } from "@/lib/ordinal";
import { useTheme } from "@/hooks/useTheme";

const CELEBRATION_BG = "#FFFFEB";

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
            backgroundColor: CELEBRATION_BG,
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
            You added your{" "}
            <Text style={{ fontFamily: "LibreBaskerville-Bold" }}>
              {ordinal}
            </Text>{" "}
            moment
          </Text>

          {isFirstMoment && (
            <>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Regular",
                  fontSize: 16,
                  color: "rgba(0,0,0,0.75)",
                  textAlign: "center",
                  marginTop: 16,
                  lineHeight: 24,
                }}
              >
                You got your first badge
              </Text>
              <View
                style={{
                  marginTop: 12,
                  width: "100%",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.primary,
                  backgroundColor: colors.primary + "18",
                  padding: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Image
                  source={require("@/assets/images/story-starter-badge.png")}
                  style={{ width: 36, height: 36 }}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: "#1A1A1A",
                    }}
                  >
                    Story Starter!
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 13,
                      color: "rgba(0,0,0,0.55)",
                      marginTop: 2,
                    }}
                  >
                    You posted your first moment. The journey begins.
                  </Text>
                </View>
              </View>
            </>
          )}

          {!isFirstMoment && (
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
              Your story is growing.
            </Text>
          )}

          <View style={{ marginTop: 28, gap: 12 }}>
            <Pressable
              onPress={() => {
                void Linking.openURL(FEEDBACK_MAIL);
              }}
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
              onPress={() => {
                void shareInvite();
              }}
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
