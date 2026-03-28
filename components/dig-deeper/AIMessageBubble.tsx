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

  return (
    <View
      style={{
        marginBottom: 12,
        maxWidth: "85%",
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignSelf: isAI ? "flex-start" : "flex-end",
        backgroundColor: isAI ? colors.surface : colors.primary,
        borderWidth: isAI ? 1 : 0,
        borderColor: isAI ? colors.border : "transparent",
      }}
    >
      {isAI && (
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 11,
            color: colors.primary,
            marginBottom: 4,
          }}
        >
          Story Coach
        </Text>
      )}
      <Text
        style={{
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 15,
          lineHeight: 24,
          color: isAI
            ? colors.text
            : theme === "dark"
              ? "#000000"
              : "#1A1A1A",
        }}
      >
        {content}
      </Text>
    </View>
  );
}
