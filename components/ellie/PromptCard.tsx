import { useState } from "react";
import { View, Text, Pressable, Image as RNImage, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { useTheme } from "@/hooks/useTheme";
import type { PromptType } from "@/lib/momentAssist";

const APP_ICON = require("@/assets/images/white-icon.png");

interface PromptCardProps {
  promptType: PromptType;
  promptValue: string;
  photoUri?: string;
  photoDate?: number;
  isShuffling?: boolean;
  onShuffle?: () => void;
  instruction?: string;
  hideHelperText?: boolean;
}

function PhotoImage({ uri }: { uri: string }) {
  const [useRnFallback, setUseRnFallback] = useState(false);

  if (useRnFallback) {
    return (
      <RNImage
        source={{ uri }}
        style={{ width: "100%", aspectRatio: 1 }}
        resizeMode="cover"
      />
    );
  }

  return (
    <Image
      key={uri}
      source={{ uri }}
      style={{ width: "100%", aspectRatio: 1 }}
      contentFit="cover"
      recyclingKey={uri}
      onError={() => {
        console.log("[PromptCard] expo-image failed, trying RN Image for:", uri?.substring(0, 60));
        setUseRnFallback(true);
      }}
    />
  );
}

export function PromptCard({
  promptType,
  promptValue,
  photoUri,
  photoDate,
  isShuffling,
  onShuffle,
  instruction,
  hideHelperText,
}: PromptCardProps) {
  const { colors } = useTheme();

  if (promptType === "photo") {
    return (
      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          {photoUri ? (
            <View>
              <PhotoImage uri={photoUri} />
              {photoDate != null && (
                <View
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    backgroundColor: "rgba(0,0,0,0.5)",
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "LibreBaskerville-Bold",
                      fontSize: 14,
                      color: "#FFFFFF",
                    }}
                  >
                    {format(new Date(photoDate), "MMM d, yyyy")}
                  </Text>
                </View>
              )}
              {isShuffling && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.45)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ActivityIndicator size="large" color="#FFFFFF" />
                </View>
              )}
            </View>
          ) : (
            <View
              style={{
                width: "100%",
                aspectRatio: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 14,
                  color: colors.textMuted,
                  marginTop: 12,
                }}
              >
                Finding a photo...
              </Text>
            </View>
          )}
          {onShuffle && (
            <Pressable
              onPress={onShuffle}
              hitSlop={8}
              style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: "rgba(0,0,0,0.55)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="shuffle" size={20} color="#FFFFFF" />
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, paddingRight: 32 }}>
          <RNImage
            source={APP_ICON}
            style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, marginTop: 2 }}
          />
          <Text
            style={{
              flex: 1,
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 24,
              color: colors.text,
            }}
          >
            What was happening here? Where does this photo take you or what does it remind you of?
          </Text>
        </View>
      </View>
    );
  }

  if (promptType === "word") {
    return (
      <View style={{ marginBottom: 16 }}>
        {instruction && (
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 14,
              color: colors.textMuted,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {instruction}
          </Text>
        )}
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.primary,
            paddingVertical: 28,
            paddingHorizontal: 20,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 36,
              color: colors.text,
              textAlign: "center",
              textTransform: "lowercase",
            }}
          >
            {promptValue}
          </Text>
        </View>
        {!hideHelperText && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 10, paddingRight: 32 }}>
            <RNImage
              source={APP_ICON}
              style={{ width: 28, height: 28, borderRadius: 8, marginRight: 10, marginTop: 2 }}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                lineHeight: 24,
                color: colors.text,
              }}
            >
              Read the word and let it take you somewhere. What memory or association does it unlock?
            </Text>
          </View>
        )}
      </View>
    );
  }

  // question or freetext
  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.primary,
        paddingVertical: 20,
        paddingHorizontal: 20,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 18,
          lineHeight: 26,
          color: colors.text,
          textAlign: "center",
        }}
      >
        {promptValue}
      </Text>
    </View>
  );
}
