import { View, Text, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface EnhancedCardProps {
  enhancedBody: string;
  enhancedTitle?: string;
  onAccept?: () => void;
  onAskChanges?: () => void;
  readonly?: boolean;
}

export function EnhancedCard({
  enhancedBody,
  enhancedTitle,
  onAccept,
  onAskChanges,
  readonly,
}: EnhancedCardProps) {
  const { colors, theme } = useTheme();
  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: readonly ? colors.border : colors.primary,
        padding: 16,
        opacity: readonly ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.primary,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {readonly ? "PREVIOUS VERSION" : "ENHANCED VERSION"}
      </Text>
      {enhancedTitle ? (
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 16,
            color: colors.text,
            marginBottom: 10,
          }}
        >
          {enhancedTitle}
        </Text>
      ) : null}
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 24,
          color: colors.text,
        }}
      >
        {enhancedBody}
      </Text>
      {!readonly && (
        <View style={{ marginTop: 16, flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={onAccept}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 9999,
              backgroundColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: theme === "dark" ? "#000000" : "#FFFFFF",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              ACCEPT
            </Text>
          </Pressable>
          <Pressable
            onPress={onAskChanges}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: colors.text,
                letterSpacing: 0.5,
              }}
            >
              Revise
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
