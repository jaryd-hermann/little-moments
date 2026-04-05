import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAudioRecorder, AudioModule, RecordingPresets } from "expo-audio";
import { transcribeAudio } from "@/lib/whisper";
import { useTheme } from "@/hooks/useTheme";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
} from "react-native-reanimated";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const BAR_COUNT = 24;

interface MicRecorderProps {
  onTranscription: (text: string) => void;
  fullscreen?: boolean;
  onCancel?: () => void;
}

function WaveformBars({
  isActive,
  barColor,
}: {
  isActive: boolean;
  barColor: string;
}) {
  const bars = Array.from({ length: BAR_COUNT });

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        height: 120,
        gap: 3,
      }}
    >
      {bars.map((_, i) => (
        <WaveBar key={i} index={i} isActive={isActive} barColor={barColor} />
      ))}
    </View>
  );
}

function WaveBar({
  index,
  isActive,
  barColor,
}: {
  index: number;
  isActive: boolean;
  barColor: string;
}) {
  const height = useSharedValue(12);

  useEffect(() => {
    if (isActive) {
      const maxH = 20 + Math.random() * 80;
      const dur = 300 + Math.random() * 400;
      height.value = withDelay(
        index * 30,
        withRepeat(
          withSequence(
            withTiming(maxH, { duration: dur }),
            withTiming(10 + Math.random() * 20, { duration: dur })
          ),
          -1,
          true
        )
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(12, { duration: 300 });
    }
  }, [isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: 4,
          borderRadius: 2,
          backgroundColor: barColor,
        },
        animatedStyle,
      ]}
    />
  );
}

export function MicRecorder({
  onTranscription,
  fullscreen,
  onCancel,
}: MicRecorderProps) {
  const { colors, theme } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [duration, setDuration] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert("Permission Required", "Microphone access is needed to record.");
        return;
      }

      await AudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();

      recorder.record();
      setIsRecording(true);
      setDuration(0);
      intervalRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[MicRecorder] startRecording failed:", msg);
      Alert.alert(
        "Recording Error",
        `Could not start recording: ${msg}`
      );
    }
  };

  const stopRecording = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsRecording(false);

    await recorder.stop();

    await AudioModule.setAudioModeAsync({
      allowsRecording: false,
    });

    const uri = recorder.uri;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(uri);
      onTranscription(text);
    } catch {
      Alert.alert("Transcription Error", "Could not transcribe audio. Please try again.");
      onCancel?.();
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCancel = async () => {
    if (isRecording) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setIsRecording(false);
      try {
        await recorder.stop();
        await AudioModule.setAudioModeAsync({ allowsRecording: false });
      } catch {}
    }
    onCancel?.();
  };

  useEffect(() => {
    if (fullscreen && !isRecording && !isTranscribing) {
      const t = setTimeout(() => startRecording(), 300);
      return () => {
        clearTimeout(t);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (fullscreen) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }}>
          {/* Top bar */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 16,
            }}
          >
            <Pressable
              onPress={handleCancel}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={22} color={colors.icon} />
            </Pressable>

            {isRecording && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#EF4444",
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {formatDuration(duration)}
                </Text>
              </View>
            )}

            <Pressable
              onPress={stopRecording}
              disabled={!isRecording}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: isRecording
                  ? theme === "dark"
                    ? "#FFFFFF"
                    : "#1A1A1A"
                  : colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
                opacity: isRecording ? 1 : 0.4,
              }}
            >
              <Ionicons
                name="checkmark"
                size={24}
                color={
                  isRecording
                    ? theme === "dark"
                      ? "#000000"
                      : "#FFFFFF"
                    : colors.textMuted
                }
              />
            </Pressable>
          </View>

          {/* Center waveform / transcribing */}
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }}>
            {isTranscribing ? (
              <View style={{ alignItems: "center" }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 15,
                    color: colors.textSecondary,
                    marginTop: 16,
                  }}
                >
                  Transcribing...
                </Text>
              </View>
            ) : (
              <WaveformBars
                isActive={isRecording}
                barColor={colors.text}
              />
            )}
          </View>

          {/* Bottom hint */}
          <View style={{ paddingBottom: 40, alignItems: "center" }}>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: colors.textMuted,
              }}
            >
              {isRecording
                ? "Tap ✓ when done"
                : isTranscribing
                  ? ""
                  : "Starting microphone..."}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Half-sheet mode: auto-start recording, show waveform bars, controls
  useEffect(() => {
    if (!fullscreen && !isRecording && !isTranscribing) {
      const t = setTimeout(() => startRecording(), 300);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <View style={{ paddingVertical: 16, paddingHorizontal: 20 }}>
      {isTranscribing ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 15,
              color: colors.textSecondary,
              marginTop: 16,
            }}
          >
            Transcribing...
          </Text>
        </View>
      ) : (
        <>
          <WaveformBars isActive={isRecording} barColor={colors.text} />

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 16,
            }}
          >
            <Pressable
              onPress={handleCancel}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="close" size={22} color={colors.icon} />
            </Pressable>

            {isRecording && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#EF4444",
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    color: colors.text,
                  }}
                >
                  {formatDuration(duration)}
                </Text>
              </View>
            )}

            <Pressable
              onPress={stopRecording}
              disabled={!isRecording}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: isRecording
                  ? theme === "dark"
                    ? "#FFFFFF"
                    : "#1A1A1A"
                  : colors.surfaceSecondary,
                alignItems: "center",
                justifyContent: "center",
                opacity: isRecording ? 1 : 0.4,
              }}
            >
              <Ionicons
                name="checkmark"
                size={24}
                color={
                  isRecording
                    ? theme === "dark"
                      ? "#000000"
                      : "#FFFFFF"
                    : colors.textMuted
                }
              />
            </Pressable>
          </View>

          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
              textAlign: "center",
              marginTop: 12,
            }}
          >
            {isRecording ? "Tap ✓ when done" : "Starting microphone..."}
          </Text>
        </>
      )}
    </View>
  );
}
