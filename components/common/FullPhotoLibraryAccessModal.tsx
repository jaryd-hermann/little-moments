import type { ReactNode } from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { ModalScrim } from "@/components/common/ModalScrim";

type FullPhotoLibraryAccessModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Invoked when the user taps the primary CTA (after optional async work). */
  onAllowAccess: () => void | Promise<void>;
  title?: string;
  body?: ReactNode;
  primaryCtaLabel?: string;
  secondaryCtaLabel?: string;
  onSecondaryCtaPress?: () => void | Promise<void>;
};

function BoldBodyText({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: "Roboto-Regular",
        fontSize: 15,
        color: "#333333",
        lineHeight: 22,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Pre-permission explainer (Flipbook “What’s this?” / InfoTipModal styling).
 * Shown before the system photo library prompt so users choose **full** access on iOS.
 */
export function FullPhotoLibraryAccessModal({
  visible,
  onClose,
  onAllowAccess,
  title = "Grant full access to photos",
  body = (
    <>
      For photo journaling to work, we need you to select{" "}
      <Text style={{ fontFamily: "Roboto-Bold" }}>full access to photos</Text>. We never
      store <Text style={{ fontFamily: "Roboto-Bold" }}>your camera roll</Text> ever,
      anywhere. Photos are all on <Text style={{ fontFamily: "Roboto-Bold" }}>your device</Text>{" "}
      unless you <Text style={{ fontFamily: "Roboto-Bold" }}>add them to a moment</Text>.
    </>
  ),
  primaryCtaLabel = "Continue",
  secondaryCtaLabel,
  onSecondaryCtaPress,
}: FullPhotoLibraryAccessModalProps) {
  const { colors } = useTheme();

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
            backgroundColor: "#FFFFEB",
            borderWidth: 2,
            borderColor: "#000000",
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 18,
              color: "#1A1A1A",
              marginBottom: 10,
            }}
          >
            {title}
          </Text>
          <BoldBodyText>{body}</BoldBodyText>
          <Pressable
            onPress={() => void Promise.resolve(onAllowAccess())}
            style={{
              marginTop: 18,
              alignSelf: "flex-end",
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: "#000000",
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#000000",
              }}
            >
              {primaryCtaLabel}
            </Text>
          </Pressable>
          {secondaryCtaLabel ? (
            <Pressable
              onPress={() =>
                void Promise.resolve(onSecondaryCtaPress ? onSecondaryCtaPress() : onClose())
              }
              style={{ marginTop: 10, alignSelf: "flex-end", paddingVertical: 4 }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 14,
                  color: "#6B6B6B",
                }}
              >
                {secondaryCtaLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
