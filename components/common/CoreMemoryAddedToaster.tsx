import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useCapsuleFlipbookStore } from "@/store/capsuleFlipbookStore";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

interface CoreMemoryAddedToasterProps {
  visible: boolean;
  coreCount: number;
  onDismiss: () => void;
}

export function CoreMemoryAddedToaster({
  visible,
  coreCount,
  onDismiss,
}: CoreMemoryAddedToasterProps) {
  const { colors } = useTheme();

  const handleViewCapsule = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    useCapsuleFlipbookStore.getState().setPinnedOnly(true);
    onDismiss();
    router.push({ pathname: "/(tabs)/memories", params: { filter: "core" } });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0, 0, 0, 0.45)",
        }}
        onPress={onDismiss}
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 36,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              marginBottom: 20,
            }}
          />

          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              lineHeight: 32,
              color: colors.text,
              textAlign: "center",
            }}
          >
            {ordinal(coreCount)} core memory added
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 21,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 8,
              marginBottom: 22,
            }}
          >
            Your most meaningful moments — saved for your album.
          </Text>

          <Pressable
            onPress={handleViewCapsule}
            accessibilityLabel="View core memories in Capsule"
            style={{
              height: 50,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
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
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              View core memories in Capsule
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
