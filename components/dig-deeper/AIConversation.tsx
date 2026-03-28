import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useTheme } from "@/hooks/useTheme";

interface EnhancedCardProps {
  enhancedBody: string;
  onAccept: () => void;
  onAskChanges: () => void;
}

export function EnhancedCard({
  enhancedBody,
  onAccept,
  onAskChanges,
}: EnhancedCardProps) {
  const { colors, theme } = useTheme();
  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.primary,
        padding: 16,
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
        ENHANCED VERSION
      </Text>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 15,
          lineHeight: 24,
          color: colors.text,
        }}
      >
        {enhancedBody}
      </Text>
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
    </View>
  );
}

export function LoadingBubble({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        marginBottom: 12,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
    >
      <ActivityIndicator size="small" color={colors.primary} />
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 14,
          color: colors.textSecondary,
          marginLeft: 8,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
