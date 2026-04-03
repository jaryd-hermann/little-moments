import { View, Text } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

/**
 * Converts basic markdown bold (**text**) into rich Text nodes.
 * Everything else is passed through as plain text.
 */
function renderRichText(
  raw: string,
  baseStyle: { fontFamily: string; fontSize: number; lineHeight: number; color: string }
): ReactNode {
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return raw;

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={{ ...baseStyle, fontFamily: "Roboto-Bold" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

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
    const baseStyle = {
      fontFamily: "Roboto-Regular",
      fontSize: 15,
      lineHeight: 24,
      color: colors.text,
    };
    return (
      <View style={{ marginBottom: 18, alignSelf: "stretch", paddingRight: 8 }}>
        <Text style={baseStyle}>
          {renderRichText(content, baseStyle)}
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
