import type { ReactNode } from "react";
import { Modal, View, Text, Pressable, ScrollView, useWindowDimensions } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { ModalScrim } from "@/components/common/ModalScrim";

type InfoTipModalProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  primaryLabel?: string;
  /** When true, body scrolls with a max height (~half screen). */
  scrollable?: boolean;
};

export function InfoTipModal({
  visible,
  onClose,
  title,
  children,
  primaryLabel = "Got it",
  scrollable = false,
}: InfoTipModalProps) {
  const { colors } = useTheme();
  const { height: windowH } = useWindowDimensions();
  const scrollMax = Math.min(360, Math.round(windowH * 0.52));

  const body = scrollable ? (
    <ScrollView
      style={{ maxHeight: scrollMax }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <ModalScrim onPress={onClose} />
        <View
          style={{
            zIndex: 2,
            borderRadius: 16,
            padding: 20,
            backgroundColor: colors.surface,
            borderWidth: 2,
            borderColor: colors.text,
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 18,
              color: colors.text,
              marginBottom: 10,
            }}
          >
            {title}
          </Text>
          {body}
          <Pressable
            onPress={onClose}
            style={{
              marginTop: 18,
              alignSelf: "flex-end",
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
              }}
            >
              {primaryLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
