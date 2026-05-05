import { View, Text, Image } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

const APP_ICON = require("@/assets/images/white-icon.png");

/**
 * Converts basic markdown into rich Text nodes:
 *   **text**  -> bold
 *   _text_    -> bold + accent color (theme: green in light, violet in dark)
 * Everything else passes through as plain text.
 */
function renderRichText(
  raw: string,
  baseStyle: { fontFamily: string; fontSize: number; lineHeight: number; color: string },
  underscoreAccentColor: string
): ReactNode {
  const parts = raw.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  if (parts.length === 1) return raw;

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={{ ...baseStyle, fontFamily: "Roboto-Bold" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <Text
          key={i}
          style={{
            ...baseStyle,
            fontFamily: "Roboto-Bold",
            color: underscoreAccentColor,
          }}
        >
          {part.slice(1, -1)}
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
  /** `_..._` trailers (e.g. "Any of this is interesting") — green ink in light, brand violet in dark. */
  const underscoreAccent =
    theme === "light" ? "#024F46" : colors.primary;

  if (isAI) {
    const baseStyle = {
      fontFamily: "Roboto-Regular",
      fontSize: 15,
      lineHeight: 24,
      color: colors.text,
    };
    return (
      <View
        style={{
          marginBottom: 18,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          paddingRight: 8,
        }}
      >
        <Image
          source={APP_ICON}
          style={{ width: 24, height: 24, borderRadius: 6, marginTop: 2 }}
        />
        <Text style={[baseStyle, { flex: 1 }]}>
          {renderRichText(content, baseStyle, underscoreAccent)}
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
