import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface StreakBadgeProps {
  count: number;
  isAtRisk?: boolean;
  onPress?: () => void;
}

export function StreakBadge({
  count,
  isAtRisk,
  onPress,
}: StreakBadgeProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ fontSize: 14 }}>🔥</Text>
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 14,
          color: colors.text,
        }}
      >
        {count}
      </Text>
    </Pressable>
  );
}
