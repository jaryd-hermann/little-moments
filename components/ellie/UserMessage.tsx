import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  const { colors, theme } = useTheme();

  return (
    <View
      style={{
        marginBottom: 12,
        maxWidth: "85%",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignSelf: "flex-end",
        backgroundColor: colors.primary,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 24,
          color: theme === "dark" ? "#000000" : "#1A1A1A",
        }}
      >
        {content}
      </Text>
    </View>
  );
}
