import { useState } from "react";
import {
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

const JARYD_PHONE = "+19143836826";
const JARYD_WHATSAPP = "19143836826";
const JARYD_EMAIL = "hermannjaryd@gmail.com";

type ContactOption = {
  id: "whatsapp" | "sms" | "email";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  url: string;
  fallbackUrl?: string;
};

const CONTACT_OPTIONS: ContactOption[] = [
  {
    id: "whatsapp",
    label: "WhatsApp me",
    icon: "logo-whatsapp",
    url: `whatsapp://send?phone=${JARYD_WHATSAPP}`,
    fallbackUrl: `https://wa.me/${JARYD_WHATSAPP}`,
  },
  {
    id: "sms",
    label: "Text me",
    icon: "chatbubble-ellipses-outline",
    url: `sms:${JARYD_PHONE}`,
  },
  {
    id: "email",
    label: "Email me",
    icon: "mail-outline",
    url: `mailto:${JARYD_EMAIL}`,
  },
];

/**
 * Personal sign-off banner at the bottom of the Capture feed. Tapping the CTA
 * opens a small sheet with three ways to reach Jaryd directly.
 */
export function MadeByJarydBanner() {
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const [sheetOpen, setSheetOpen] = useState(false);

  const openContact = async (option: ContactOption) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    posthog?.capture("message_jaryd_option_tapped", { option: option.id });
    try {
      const supported = await Linking.canOpenURL(option.url);
      if (supported) {
        await Linking.openURL(option.url);
      } else if (option.fallbackUrl) {
        await Linking.openURL(option.fallbackUrl);
      }
    } catch {
      if (option.fallbackUrl) {
        try {
          await Linking.openURL(option.fallbackUrl);
        } catch {
          /* nothing else we can do */
        }
      }
    }
    setSheetOpen(false);
  };

  return (
    <View style={{ paddingHorizontal: 20, marginTop: 28, marginBottom: 8 }}>
      <View
        style={[
          {
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingVertical: 22,
            paddingHorizontal: 20,
          },
          bevelShadow(theme),
        ]}
      >
        <Text
          style={{
            fontFamily: "Roboto-Bold",
            fontSize: 16,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Hey, I'm Jaryd!
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            lineHeight: 19,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 8,
            marginBottom: 18,
          }}
        >
          If you see an issue or have an idea, let me know personally so I can
          fix it!
        </Text>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            posthog?.capture("message_jaryd_opened");
            setSheetOpen(true);
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <View
            style={[
              {
                height: 52,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: PINK_CTA_BORDER,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              },
              bevelShadow(theme),
            ]}
          >
            <Ionicons name="chatbubbles-outline" size={18} color={PINK_CTA_INK} />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: PINK_CTA_INK,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Message me
            </Text>
          </View>
        </Pressable>
      </View>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
          onPress={() => setSheetOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingHorizontal: 20,
              paddingBottom: insets.bottom + 16,
            }}
          >
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 5,
                borderRadius: 9999,
                backgroundColor: colors.border,
                marginBottom: 16,
              }}
            />
            <Text
              style={{
                fontFamily: "Roboto-Bold",
                fontSize: 17,
                color: colors.text,
                textAlign: "center",
                marginBottom: 4,
              }}
            >
              Message Jaryd
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 13,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              Pick whatever's easiest for you.
            </Text>

            {CONTACT_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => void openContact(option)}
                accessibilityRole="button"
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <View
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      height: 54,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: colors.text,
                      marginBottom: 12,
                      backgroundColor: colors.surfaceSecondary,
                    },
                    bevelShadow(theme),
                  ]}
                >
                  <Ionicons name={option.icon} size={20} color={colors.text} />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 15,
                      color: colors.text,
                      letterSpacing: 0.3,
                    }}
                  >
                    {option.label}
                  </Text>
                </View>
              </Pressable>
            ))}

            <Pressable
              onPress={() => setSheetOpen(false)}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    color: colors.textSecondary,
                  }}
                >
                  Cancel
                </Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
