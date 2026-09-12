import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { MAGIC_FILL_YOU_PICK_MAX } from "@/lib/magicFillYouPick";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface MagicFillYouPickSheetProps {
  visible: boolean;
  onClose: () => void;
  onChoosePhotos: () => void;
  /** Fires after the sheet has fully animated out (iOS). */
  onDismiss?: () => void;
}

export function MagicFillYouPickSheet({
  visible,
  onClose,
  onChoosePhotos,
  onDismiss,
}: MagicFillYouPickSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      onDismiss={onDismiss}
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
            paddingTop: 20,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 16 }}>
            <Ionicons name="images-outline" size={32} color={colors.text} />
          </View>

          <Text
            style={magicFillHeadlineStyle({
              fontSize: 24,
              lineHeight: 30,
              color: colors.text,
              textAlign: "center",
              marginBottom: 12,
            })}
          >
            You pick
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 22,
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Have some older moments in mind you want to capture? For example, a
            specific person, place, or time — use this to select the ones you
            want and we&apos;ll queue them to help you capture them fast,
            forever.
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              lineHeight: 18,
              color: colors.textMuted,
              textAlign: "center",
              marginBottom: 20,
            }}
          >
            Choose up to {MAGIC_FILL_YOU_PICK_MAX} photos or videos. We group
            them by day — one moment per day in this batch.
          </Text>

          <MagicFillPrimaryButton
            label="Choose from my photos"
            variant="pink"
            onPress={onChoosePhotos}
          />

          <Pressable
            onPress={onClose}
            style={{
              marginTop: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.textMuted,
              }}
            >
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
