import { View, Text, Image } from "react-native";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";

const APP_ICON = require("@/assets/images/white-icon.png");

function renderRichText(
  raw: string,
  baseStyle: { fontFamily: string; fontSize: number; lineHeight: number; color: string },
  boldColorMap?: Record<string, string>
): ReactNode {
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return raw;

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      const inner = part.slice(2, -2);
      const boldColor = boldColorMap?.[inner];
      return (
        <Text
          key={i}
          style={{
            ...baseStyle,
            fontFamily: "Roboto-Bold",
            color: boldColor ?? baseStyle.color,
          }}
        >
          {inner}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

interface EllieMessageProps {
  content: string;
  showAvatar?: boolean;
  /** Map exact **inner** text to a text color (e.g. activation highlights). */
  boldColorMap?: Record<string, string>;
}

export function EllieMessage({ content, showAvatar = false, boldColorMap }: EllieMessageProps) {
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
        <Text style={baseStyle}>{renderRichText(content, baseStyle, boldColorMap)}</Text>
      </View>
    </View>
  );
}
