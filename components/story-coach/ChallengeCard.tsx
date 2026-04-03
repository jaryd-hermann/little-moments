import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface ChallengeCardProps {
  content: string;
}

export function ChallengeCard({ content }: ChallengeCardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        marginBottom: 18,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: "#FFA946",
        padding: 16,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: "#FFA946",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        TRY THIS TOMORROW
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 24,
          color: colors.text,
        }}
      >
        {content}
      </Text>
    </View>
  );
}
