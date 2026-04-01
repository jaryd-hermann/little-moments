import { useState } from "react";
import { View, TextInput, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MicRecorder } from "@/components/composer/MicRecorder";
import { useTheme } from "@/hooks/useTheme";

interface CrashBurnComposerProps {
  text: string;
  onChangeText: (text: string) => void;
  onFinishRace?: () => void;
}

export function CrashBurnComposer({
  text,
  onChangeText,
  onFinishRace,
}: CrashBurnComposerProps) {
  const { colors } = useTheme();
  const [micFullscreen, setMicFullscreen] = useState(false);

  if (micFullscreen) {
    return (
      <View className="flex-1">
        <View style={{ flex: 1, opacity: 0.3, paddingTop: 8 }}>
          {text ? (
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: "#FFFFFF",
                lineHeight: 22,
              }}
              numberOfLines={4}
            >
              {text}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            height: "55%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            overflow: "hidden",
          }}
        >
          <MicRecorder
            fullscreen
            onTranscription={(transcribed) => {
              onChangeText(text ? text + " " + transcribed : transcribed);
              setMicFullscreen(false);
            }}
            onCancel={() => setMicFullscreen(false)}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <TextInput
        value={text}
        onChangeText={onChangeText}
        multiline
        autoFocus
        placeholder="Start writing... don't stop, don't edit, just go."
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
        style={{
          flex: 1,
          fontFamily: "Roboto-Regular",
          fontSize: 16,
          lineHeight: 28,
          color: "#FFFFFF",
          textAlignVertical: "top",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={() => setMicFullscreen(true)}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            height: 48,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: "#FFFFFF",
          }}
        >
          <Ionicons name="mic-outline" size={18} color="#FFFFFF" />
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: "#FFFFFF",
            }}
          >
            Speak &amp; transcribe
          </Text>
        </Pressable>
        {onFinishRace ? (
          <Pressable
            onPress={onFinishRace}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#1A1A1A",
                letterSpacing: 0.5,
              }}
            >
              Finish Race
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
