import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

const LIGHT = {
  cardBg: "#FFFFEB",
  cardBorder: "rgba(0,0,0,0.18)",
  ink: "#1A1A1A",
  subtext: "rgba(0,0,0,0.58)",
  divider: "rgba(0,0,0,0.18)",
  iconTileBg: "rgba(0,0,0,0.04)",
  ctaStroke: "#000000",
  ctaShadow: "#000000",
  ctaTextColor: "#1A1A1A",
};

const DARK = {
  cardBg: "transparent",
  cardBorder: "rgba(255,255,255,0.18)",
  ink: "#FFFFFF",
  subtext: "rgba(255,255,255,0.65)",
  divider: "rgba(255,255,255,0.18)",
  iconTileBg: "rgba(255,255,255,0.06)",
  ctaStroke: "#000000",
  ctaShadow: "#FFFFEB",
  ctaTextColor: "#1A1A1A",
};

export interface PhotoAccessNudgeCardProps {
  /** Headline copy. Default: "Grant photo access to start" */
  headline?: string;
  /** Sub copy. Default explains why we need full access. */
  subtitle?: string;
  /** Primary CTA label. Default "CONTINUE" (uppercased). */
  primaryLabel?: string;
  /** Headline font — defaults to Libre Baskerville for compact surfaces. */
  headlineFontFamily?: string;
  /** Headline size in px — card variant defaults to 22. */
  headlineFontSize?: number;
  /** Tap handler for the primary CTA. Should invoke `ensureFullPhotoAccess()`. */
  onPrimaryPress: () => void | Promise<void>;
  /** Secondary text-link label. Default "or start with a word instead". */
  wordFallbackLabel?: string;
  /** When false, omits the leading "or" before the secondary link. */
  showSecondaryOrPrefix?: boolean;
  /** Tap handler for the word-fallback link. Pass `undefined` to hide the link. */
  onWordFallbackPress?: () => void | Promise<void>;
  /**
   * Visual density. `compact` is used inside `PromptCard` (no outer card chrome,
   * smaller typography). `card` is used as a standalone full-width card on
   * onboarding's photo-permission screen.
   */
  variant?: "card" | "compact";
}

export function PhotoAccessNudgeCard({
  headline = "Grant photo access to start",
  subtitle = "We'll surface one photo at a time. Nothing leaves your device until you save.",
  primaryLabel = "CONTINUE",
  headlineFontFamily = "LibreBaskerville-Bold",
  headlineFontSize,
  onPrimaryPress,
  wordFallbackLabel = "start with a word instead",
  showSecondaryOrPrefix = true,
  onWordFallbackPress,
  variant = "card",
}: PhotoAccessNudgeCardProps) {
  const { colors, theme } = useTheme();
  const isCompact = variant === "compact";
  const palette = theme === "dark" ? DARK : LIGHT;
  const resolvedHeadlineSize = headlineFontSize ?? (isCompact ? 20 : 22);
  const resolvedHeadlineLineHeight =
    headlineFontSize != null
      ? Math.round(resolvedHeadlineSize * 1.25)
      : isCompact
        ? 26
        : 30;

  const handlePrimary = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Promise.resolve(onPrimaryPress());
  };
  const handleWord = () => {
    if (!onWordFallbackPress) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Promise.resolve(onWordFallbackPress());
  };

  return (
    <View
      style={
        isCompact
          ? {
              alignItems: "center",
              paddingVertical: 28,
              paddingHorizontal: 24,
              backgroundColor: palette.cardBg,
            }
          : {
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: palette.cardBorder,
              borderStyle: "dashed",
              backgroundColor: palette.cardBg,
              paddingVertical: 32,
              paddingHorizontal: 28,
              alignItems: "center",
            }
      }
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: palette.ink,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.iconTileBg,
          marginBottom: 14,
        }}
      >
        <Ionicons name="image-outline" size={28} color={palette.ink} />
      </View>

      <Text
        style={{
          fontFamily: headlineFontFamily,
          fontSize: resolvedHeadlineSize,
          lineHeight: resolvedHeadlineLineHeight,
          color: palette.ink,
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        {headline}
      </Text>

      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 22,
          color: palette.subtext,
          textAlign: "center",
          maxWidth: 320,
          marginBottom: 22,
        }}
      >
        {subtitle}
      </Text>

      <Pressable
        accessibilityLabel={primaryLabel}
        onPress={handlePrimary}
        style={
          theme === "dark"
            ? {
                alignSelf: "stretch",
                height: 56,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: palette.ctaStroke,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: palette.ctaShadow,
                shadowOffset: { width: 0, height: 5 },
                shadowOpacity: 1,
                shadowRadius: 0,
                elevation: 6,
              }
            : {
                paddingHorizontal: 28,
                paddingVertical: 14,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: palette.ctaStroke,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: palette.ctaShadow,
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 1,
                shadowRadius: 0,
                elevation: 4,
              }
        }
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: theme === "dark" ? 15 : 14,
            color: palette.ctaTextColor,
            letterSpacing: 0.8,
            textTransform: "uppercase",
          }}
        >
          {primaryLabel}
        </Text>
      </Pressable>

      {onWordFallbackPress ? (
        <>
          <View
            style={{
              width: 200,
              height: 1,
              backgroundColor: palette.divider,
              marginTop: 26,
              marginBottom: 14,
            }}
          />
          <Pressable
            accessibilityLabel={wordFallbackLabel}
            onPress={handleWord}
            hitSlop={8}
            style={{ paddingVertical: 4 }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: palette.subtext,
                textAlign: "center",
              }}
            >
              {showSecondaryOrPrefix ? (
                <>
                  or{" "}
                  <Text
                    style={{
                      textDecorationLine: "underline",
                      color: palette.ink,
                    }}
                  >
                    {wordFallbackLabel}
                  </Text>
                </>
              ) : (
                <Text
                  style={{ textDecorationLine: "underline", color: palette.ink }}
                >
                  {wordFallbackLabel}
                </Text>
              )}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}
