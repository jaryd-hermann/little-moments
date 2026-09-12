import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { useMagicFillStore } from "@/store/magicFillStore";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";

type MagicFillScreenHeaderProps = {
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  /** Show X to exit the flow (default true). */
  showExit?: boolean;
  onExit?: () => void;
};

function hasMagicFillProgress(): boolean {
  const { drafts } = useMagicFillStore.getState();
  return drafts.some((d) => !d.skipped && d.rawCaption.trim());
}

/** Back + optional exit header for Magic Fill screens. */
export function MagicFillScreenHeader({
  onBack,
  rightSlot,
  showExit = true,
  onExit,
}: MagicFillScreenHeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [exitModalVisible, setExitModalVisible] = useState(false);

  const handleBack = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/today");
    }
  };

  const confirmExit = () => {
    setExitModalVisible(false);
    useMagicFillStore.getState().reset();
    if (onExit) {
      onExit();
    } else {
      router.replace("/(tabs)/today");
    }
  };

  const handleExitPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!hasMagicFillProgress()) {
      confirmExit();
      return;
    }
    setExitModalVisible(true);
  };

  return (
    <>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 12,
          paddingBottom: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityLabel="Go back"
          onPress={handleBack}
          hitSlop={12}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {rightSlot}
        {showExit ? (
          <Pressable
            accessibilityLabel="Exit Magic Fill"
            onPress={handleExitPress}
            hitSlop={12}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={exitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setExitModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            paddingHorizontal: 28,
          }}
          onPress={() => setExitModalVisible(false)}
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
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 18,
                lineHeight: 26,
                color: colors.text,
                marginBottom: 10,
              }}
            >
              You&apos;re almost done
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                lineHeight: 22,
                color: colors.textSecondary,
                marginBottom: 20,
              }}
            >
              Are you sure you want to quit and lose these moments?
            </Text>
            <MagicFillPrimaryButton
              label="Keep going"
              variant="pink"
              onPress={() => setExitModalVisible(false)}
              style={{ marginBottom: 10 }}
            />
            <Pressable
              onPress={confirmExit}
              style={{ paddingVertical: 12, alignItems: "center" }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.textMuted,
                }}
              >
                Exit
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
