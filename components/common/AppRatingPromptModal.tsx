import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { MAGIC_FILL_CTA_FILL } from "@/lib/magicFillTypography";
import { scheduleStoreReviewRequest } from "@/lib/ratingPrompt";

type AppRatingPromptModalProps = {
  visible: boolean;
  onDismiss: () => void;
};

/** Dismissible modal that offers to open the native in-app review sheet. */
export function AppRatingPromptModal({
  visible,
  onDismiss,
}: AppRatingPromptModalProps) {
  const { colors, theme } = useTheme();

  const handleRate = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDismiss();
    scheduleStoreReviewRequest("magic_fill_completed", { delayMs: 400 });
  };

  const handleDismiss = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          paddingHorizontal: 28,
        }}
        onPress={handleDismiss}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            borderRadius: 20,
            backgroundColor: colors.background,
            padding: 24,
            borderWidth: 2,
            borderColor: colors.text,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: "Roboto-Medium",
                fontSize: 18,
                lineHeight: 26,
                color: colors.text,
                paddingRight: 8,
              }}
            >
              Help with an app rating
            </Text>
            <Pressable
              accessibilityLabel="Dismiss"
              onPress={handleDismiss}
              hitSlop={10}
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 22,
              color: colors.textSecondary,
              marginBottom: 20,
            }}
          >
            If Magic Fill helped you catch up, a quick App Store rating helps
            more people discover Little Moments.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleRate}
            style={{
              height: 56,
              borderRadius: 9999,
              backgroundColor: MAGIC_FILL_CTA_FILL,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10,
              ...bevelShadow(theme),
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Rate the app
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDismiss}
            style={{ paddingVertical: 12, alignItems: "center" }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.textMuted,
              }}
            >
              Not now
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
