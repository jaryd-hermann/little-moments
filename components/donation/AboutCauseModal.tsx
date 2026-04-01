import { Modal, View, Text, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ModalScrim } from "@/components/common/ModalScrim";
import type { DonationCause } from "@/constants/donationCauses";

const BG = "#FFFFEB";

type AboutCauseModalProps = {
  visible: boolean;
  cause: DonationCause | null;
  onClose: () => void;
};

export function AboutCauseModal({
  visible,
  cause,
  onClose,
}: AboutCauseModalProps) {
  const insets = useSafeAreaInsets();

  if (!cause) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <ModalScrim onPress={onClose} />

        <View
          style={{
            zIndex: 2,
            backgroundColor: BG,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 12,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 24),
          }}
        >
          {/* Drag handle */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: "rgba(0,0,0,0.15)",
              }}
            />
          </View>

          {/* Category label */}
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 11,
              color: "rgba(0,0,0,0.45)",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {cause.category_label}
          </Text>

          {/* Title */}
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 26,
              color: "#1A1A1A",
              marginBottom: 16,
            }}
          >
            {cause.title}
          </Text>

          {/* Description */}
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 15,
              color: "rgba(0,0,0,0.7)",
              lineHeight: 24,
              marginBottom: 24,
            }}
          >
            {cause.description}
          </Text>

          {/* Org row — tappable link to org page */}
          <Pressable
            onPress={() => void Linking.openURL(cause.donation_link)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.04)",
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(0,0,0,0.08)",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 12,
              }}
            >
              <Ionicons name="heart" size={18} color="rgba(0,0,0,0.3)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: "#1A1A1A",
                }}
              >
                {cause.org_name}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 13,
                  color: "rgba(0,0,0,0.5)",
                  marginTop: 1,
                }}
              >
                Partner Organization
              </Text>
            </View>
            <Ionicons
              name="open-outline"
              size={16}
              color="rgba(0,0,0,0.3)"
            />
          </Pressable>

          {/* Donation link */}
          <Pressable
            onPress={() => void Linking.openURL(cause.donation_link)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: "rgba(0,0,0,0.5)",
              }}
            >
              Donations through Every.org
            </Text>
            <Ionicons
              name="open-outline"
              size={14}
              color="rgba(0,0,0,0.4)"
            />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
