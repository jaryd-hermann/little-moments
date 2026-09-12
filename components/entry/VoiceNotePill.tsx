import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/useTheme";

const BAR_COUNT = 18;
/** Fixed per-bar heights so the waveform reads as a waveform, not noise. */
const BAR_SCALE = [
  0.4, 0.7, 1, 0.55, 0.85, 0.35, 0.6, 1, 0.75, 0.45, 0.9, 0.5, 0.8, 0.3, 0.65,
  0.95, 0.5, 0.7,
];
const BAR_MAX_HEIGHT = 20;

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function WaveBar({
  index,
  active,
  color,
}: {
  index: number;
  active: boolean;
  color: string;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 160 });
      return;
    }
    // Stagger the bars so the row ripples rather than pulsing in unison.
    scale.value = withRepeat(
      withTiming(0.45, { duration: 420 + (index % 5) * 90 }),
      -1,
      true
    );
    return () => cancelAnimation(scale);
  }, [active, index, scale]);

  const height = BAR_MAX_HEIGHT * (BAR_SCALE[index % BAR_SCALE.length] ?? 0.6);
  const style = useAnimatedStyle(() => ({ height: height * scale.value }));

  return (
    <Animated.View
      style={[
        { width: 3, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/**
 * Playback chip for the original audio of a voice-captured moment.
 *
 * Only rendered on the moment detail screen — the voice note is intentionally
 * absent from shares, summary cards and movies.
 */
export function VoiceNotePill({
  url,
  durationSeconds,
}: {
  url: string;
  durationSeconds?: number | null;
}) {
  const { colors } = useTheme();
  const source = useMemo(() => ({ uri: url }), [url]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const isPlaying = status.playing;
  const isMuted = player.muted;

  // Play through the earpiece-bypassing route and don't leave the app's audio
  // session in recording mode if the user came straight from a capture.
  useEffect(() => {
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, []);

  useEffect(() => {
    if (status.didJustFinish) {
      void player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish, player]);

  const togglePlay = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const toggleMute = () => {
    void Haptics.selectionAsync();
    player.muted = !player.muted;
  };

  const total =
    durationSeconds && durationSeconds > 0 ? durationSeconds : status.duration;
  const label = isPlaying
    ? formatDuration(Math.max(0, total - status.currentTime))
    : formatDuration(total);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 10,
        paddingLeft: 6,
        paddingRight: 12,
        paddingVertical: 6,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: colors.borderLight,
        backgroundColor: colors.surfaceSecondary,
      }}
      accessibilityLabel={`Voice note, ${formatDuration(total)}`}
    >
      <Pressable
        onPress={togglePlay}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause voice note" : "Play voice note"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
        }}
      >
        <Ionicons
          name={isPlaying ? "pause" : "play"}
          size={16}
          color={colors.text}
          // Optical centring — the play triangle sits left of true centre.
          style={isPlaying ? undefined : { marginLeft: 2 }}
        />
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          height: BAR_MAX_HEIGHT,
        }}
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <WaveBar
            key={i}
            index={i}
            active={isPlaying && !isMuted}
            color={colors.textSecondary}
          />
        ))}
      </View>

      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 13,
          color: colors.textSecondary,
          fontVariant: ["tabular-nums"],
        }}
      >
        {label}
      </Text>

      <Pressable
        onPress={toggleMute}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isMuted ? "Unmute voice note" : "Mute voice note"}
      >
        <Ionicons
          name={isMuted ? "volume-mute" : "volume-high"}
          size={18}
          color={isMuted ? colors.textSecondary : colors.text}
        />
      </Pressable>
    </View>
  );
}
