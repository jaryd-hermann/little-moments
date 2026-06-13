import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { launchMagicFill, type MagicFillEntrySource } from "@/lib/magicFillLaunch";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { MagicFillPeachPillButton } from "./MagicFillPeachPillButton";

type MagicFillBannerProps = {
  source: MagicFillEntrySource;
  gapCount?: number;
  onDismiss?: () => void;
  /** Larger title + CTA for the Capture tab banner. */
  prominent?: boolean;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  /** Omit outer horizontal padding when nested inside a padded parent. */
  embedded?: boolean;
};

export function MagicFillBanner({
  source,
  onDismiss,
  prominent = false,
  title = "Magic fill recent moments",
  subtitle = "Log life quickly, capture several past moments in one go!",
  ctaLabel = "✦ Magic fill",
  embedded = false,
}: MagicFillBannerProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();

  const dismissable = Boolean(onDismiss);

  const handleLaunch = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_entry_tapped", { source });
    launchMagicFill(source);
  };

  const handleDismiss = () => {
    if (!onDismiss) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDismiss();
  };

  return (
    <View style={{ paddingHorizontal: embedded ? 0 : 20, marginBottom: 16 }}>
      <View
        style={{
          borderRadius: 20,
          padding: 20,
          borderWidth: 1.5,
          borderColor: colors.border,
          backgroundColor: theme === "dark" ? colors.surface : "#FFFFEB",
        }}
      >
        {dismissable ? (
          <Pressable
            accessibilityLabel="Dismiss Magic Fill banner"
            onPress={handleDismiss}
            hitSlop={12}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.surfaceSecondary,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
            }}
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <Text
          style={magicFillHeadlineStyle({
            fontSize: prominent ? 28 : 22,
            lineHeight: prominent ? 34 : 28,
            color: colors.text,
            marginBottom: 8,
            paddingRight: dismissable ? 28 : 0,
          })}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 20,
            color: colors.textSecondary,
            marginBottom: 16,
          }}
        >
          {subtitle}
        </Text>

        <MagicFillPeachPillButton
          label={ctaLabel}
          onPress={handleLaunch}
          fullWidth
          size={prominent ? "large" : "default"}
        />
      </View>
    </View>
  );
}
