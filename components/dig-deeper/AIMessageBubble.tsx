import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface AIMessageBubbleProps {
  content: string;
  role: "user" | "assistant";
}

export function AIMessageBubble({
  content,
  role,
}: AIMessageBubbleProps) {
  const { colors, theme } = useTheme();
  const isAI = role === "assistant";

  if (isAI) {
    return (
      <View style={{ marginBottom: 18, alignSelf: "stretch", paddingRight: 8 }}>
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
