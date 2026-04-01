import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useTheme } from "@/hooks/useTheme";

const STREAK_FLAME = require("@/assets/images/streak-flame.png");

interface StreakBadgeProps {
  count: number;
  totalMoments: number;
  isAtRisk?: boolean;
  onPress?: () => void;
}

export function StreakBadge({
  count,
  totalMoments,
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
        gap: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: isAtRisk ? colors.warning : colors.border,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Image
          source={STREAK_FLAME}
          style={{ width: 20, height: 20 }}
          contentFit="contain"
          accessibilityLabel="Streak"
        />
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 14,
            color: colors.text,
          }}
        >
          {count}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 14,
          color: colors.textMuted,
        }}
      >
        |
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name="book-outline" size={15} color={colors.icon} />
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 14,
            color: colors.text,
          }}
        >
          {totalMoments}
        </Text>
      </View>
    </Pressable>
  );
}
