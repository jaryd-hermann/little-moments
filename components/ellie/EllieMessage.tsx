import { View, Text, Image } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

const APP_ICON = require("@/assets/images/white-icon.png");

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

interface EllieMessageProps {
  content: string;
  showAvatar?: boolean;
}

export function EllieMessage({ content, showAvatar = false }: EllieMessageProps) {
  const { colors } = useTheme();

  const baseStyle = {
    fontFamily: "Roboto-Regular" as const,
    fontSize: 15,
    lineHeight: 24,
    color: colors.text,
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 16, paddingRight: 32 }}>
      {showAvatar && (
        <Image
          source={APP_ICON}
          style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, marginTop: 2 }}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text style={baseStyle}>{renderRichText(content, baseStyle)}</Text>
      </View>
    </View>
  );
}
