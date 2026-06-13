import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { Text, View, type ViewStyle } from "react-native";

export type LocationTagVariant = "overlay" | "inline";

/**
 * Tiny "📍 City, Country" pill. Two visual variants:
 *
 *  - `overlay`  — semi-transparent dark chip with white text, sized to sit
 *                 on top of an image (used in the Today In Your Past
 *                 carousel and on captured-moment thumbnails).
 *  - `inline`   — neutral surface chip, sized for a row inside a card body
 *                 (entry detail, captured-day cards beneath the title).
 *
 * Renders `null` when `name` is null/empty so callers can plug this in
 * unconditionally without a wrapper check.
 */
export function LocationTag({
  name,
  variant = "inline",
  style,
}: {
  name: string | null | undefined;
  variant?: LocationTagVariant;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  if (!name) return null;

  if (variant === "overlay") {
    return (
      <View
        style={[
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 9999,
            backgroundColor: "rgba(0,0,0,0.55)",
            alignSelf: "flex-start",
            maxWidth: 220,
          },
          style,
        ]}
      >
        <Ionicons name="location-sharp" size={11} color="#FFFFFF" />
        <Text
          numberOfLines={1}
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: "#FFFFFF",
            flexShrink: 1,
          }}
        >
          {name}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 9999,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceSecondary,
          alignSelf: "flex-start",
          maxWidth: 240,
        },
        style,
      ]}
    >
      <Ionicons name="location-sharp" size={11} color={colors.textSecondary} />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 11,
          color: colors.textSecondary,
          flexShrink: 1,
        }}
      >
        {name}
      </Text>
    </View>
  );
}
