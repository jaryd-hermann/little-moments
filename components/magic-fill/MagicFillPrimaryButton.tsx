import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/hooks/useTheme";
import { MAGIC_FILL_CTA_FILL } from "@/lib/magicFillTypography";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";

type MagicFillPrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "pink" | "purple" | "violet" | "dark";
  /** Force light bevel on dark celebration backgrounds (e.g. success screen). */
  celebrationShadow?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function MagicFillPrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = "pink",
  celebrationShadow = false,
  icon,
  style,
}: MagicFillPrimaryButtonProps) {
  const { colors, theme } = useTheme();
  const shadowTheme = celebrationShadow ? "dark" : theme;

  const handlePress = () => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  if (variant === "purple" || variant === "violet") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        onPress={handlePress}
        disabled={disabled}
        style={[{ opacity: disabled ? 0.5 : 1 }, style]}
      >
        <LinearGradient
          colors={["#7C3AED", "#5B21B6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height: 56,
            borderRadius: 9999,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingHorizontal: 24,
          }}
        >
          {icon}
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#FFFFFF",
              letterSpacing: 0.6,
            }}
          >
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    );
  }

  const bg =
    variant === "dark" ? colors.text : MAGIC_FILL_CTA_FILL;
  const ink = variant === "dark" ? colors.background : PINK_CTA_INK;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={handlePress}
      disabled={disabled}
      style={[
        {
          height: 56,
          borderRadius: 9999,
          backgroundColor: bg,
          borderWidth: 2,
          borderColor: PINK_CTA_BORDER,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 24,
          opacity: disabled ? 0.5 : 1,
          ...bevelShadow(shadowTheme),
        },
        style,
      ]}
    >
      {icon}
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 15,
          color: ink,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MagicFillSparkleIcon({ size = 18 }: { size?: number }) {
  return (
    <Text style={{ fontSize: size, color: "#FFFFFF" }} accessibilityElementsHidden>
      ✦
    </Text>
  );
}
