import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

type DashedEmptyStateProps = {
  title: string;
  subtitle: string;
  ctaLabel: string;
  onCtaPress: () => void;
  /** When set, title stays on one line and shrinks slightly if needed (Capsule). */
  singleLineTitle?: boolean;
};

/**
 * Dashed “card” empty state used on Chapters and Capsule for visual consistency.
 */
export function DashedEmptyState({
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  singleLineTitle = false,
}: DashedEmptyStateProps) {
  const { colors, theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 100,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 24,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.border,
          padding: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 120,
            height: 80,
            marginBottom: 28,
            position: "relative",
          }}
        >
          {[
            { left: 6, top: 18 },
            { left: 36, top: 0 },
            { left: 70, top: 24 },
            { left: 30, top: 48 },
          ].map((p, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: p.left,
                top: p.top,
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: colors.primary,
                borderWidth: 1,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: singleLineTitle ? 17 : 18,
            lineHeight: singleLineTitle ? 24 : 26,
            color: colors.text,
            textAlign: "center",
            marginBottom: 10,
            width: "100%",
          }}
          numberOfLines={singleLineTitle ? 1 : undefined}
          adjustsFontSizeToFit={singleLineTitle}
          minimumFontScale={singleLineTitle ? 0.82 : 1}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          {subtitle}
        </Text>
        <Pressable
          onPress={onCtaPress}
          style={{
            height: 56,
            paddingHorizontal: 28,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
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
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
