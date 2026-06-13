import { useTheme } from "@/hooks/useTheme";
import type { MashupBucket } from "@/lib/mashupBuckets";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";

export type MashupToasterAction = "share" | "replay";

export interface MashupCompleteToasterProps {
  visible: boolean;
  bucket: MashupBucket | null;
  onDismiss: () => void;
  /**
   * Fired when the user taps one of the three CTAs. The parent wires this
   * to PostHog + (eventually) the real share / replay / edit handlers — for
   * this milestone all three just close the toaster.
   */
  onAction: (action: MashupToasterAction) => void;
}

interface ToasterCtaProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant: "primary" | "secondary";
  onPress: () => void;
}

function ToasterCta({ label, icon, variant, onPress }: ToasterCtaProps) {
  const { colors } = useTheme();
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        height: 50,
        borderRadius: 9999,
        backgroundColor: primary ? colors.primary : "transparent",
        borderWidth: primary ? 2 : 1.5,
        borderColor: primary ? PINK_CTA_BORDER : colors.border,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
      }}
    >
      <Ionicons
        name={icon}
        size={16}
        color={primary ? PINK_CTA_INK : colors.text}
      />
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 14,
          color: primary ? PINK_CTA_INK : colors.text,
          letterSpacing: primary ? 0.6 : 0.4,
          textTransform: primary ? "uppercase" : "none",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Slide-up sheet shown after the full-screen mashup playback ends (or the
 * user taps X). Offers Share / Watch again CTAs.
 */
export function MashupCompleteToaster({
  visible,
  bucket,
  onDismiss,
  onAction,
}: MashupCompleteToasterProps) {
  const { colors } = useTheme();
  if (!bucket) return null;

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
              marginBottom: 16,
            }}
          />

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 22,
                  color: colors.text,
                  marginBottom: 4,
                }}
              >
                {bucket.label}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  color: colors.textSecondary,
                }}
              >
                {bucket.count} Moment{bucket.count === 1 ? "" : "s"} stitched
                into a mash-up.
              </Text>
            </View>
            <Pressable
              onPress={onDismiss}
              hitSlop={12}
              accessibilityLabel="Dismiss"
              style={{
                width: 32,
                height: 32,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <ToasterCta
              label="Share with someone"
              icon="share-outline"
              variant="primary"
              onPress={() => onAction("share")}
            />
            <ToasterCta
              label="Watch it again"
              icon="play-circle-outline"
              variant="secondary"
              onPress={() => onAction("replay")}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
