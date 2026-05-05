import { View, Text, Pressable } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { smartParagraphs } from "@/lib/paragraphs";

interface EnhancedCardProps {
  enhancedBody: string;
  enhancedTitle?: string;
  onAccept?: () => void;
  onAskChanges?: () => void;
  acceptLabel?: string;
  askChangesLabel?: string;
  readonly?: boolean;
  /** Optional photo URI (storage_url or local) shown at the top of the card. */
  photoUri?: string;
  /** When true, hides the "ENHANCED VERSION" eyebrow tag. */
  hideEyebrow?: boolean;
}

export function EnhancedCard({
  enhancedBody,
  enhancedTitle,
  onAccept,
  onAskChanges,
  acceptLabel,
  askChangesLabel,
  readonly,
  photoUri,
  hideEyebrow,
}: EnhancedCardProps) {
  const { colors } = useTheme();
  const paragraphs = smartParagraphs(enhancedBody);

  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: readonly ? colors.border : colors.primary,
        overflow: "hidden",
        opacity: readonly ? 0.6 : 1,
      }}
    >
      {photoUri ? (
        <ExpoImage
          source={{ uri: photoUri }}
          style={{ width: "100%", height: 180, backgroundColor: colors.surfaceSecondary }}
          contentFit="cover"
        />
      ) : null}
      <View style={{ padding: 16 }}>
        {!hideEyebrow && !readonly ? (
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
        ) : null}
        {readonly ? (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 11,
              color: colors.textMuted,
              letterSpacing: 1,
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            PREVIOUS VERSION
          </Text>
        ) : null}
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
        {paragraphs.map((p, i) => (
          <Text
            key={i}
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 24,
              color: colors.text,
              marginBottom: i < paragraphs.length - 1 ? 12 : 0,
            }}
          >
            {p}
          </Text>
        ))}
        {!readonly && (
          <View style={{ marginTop: 16, flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={onAccept}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 1.5,
                borderColor: PINK_CTA_BORDER,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {acceptLabel ?? "ACCEPT"}
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
                {askChangesLabel ?? "Revise"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
