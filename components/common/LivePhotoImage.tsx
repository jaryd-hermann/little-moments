import { useSettingsStore } from "@/store/settingsStore";
import { useTheme } from "@/hooks/useTheme";
import { Image, type ImageContentFit } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useMemo } from "react";
import { Platform, StyleProp, View, ViewStyle, Text } from "react-native";

export interface LivePhotoImageProps {
  /** Always-required still URI. */
  staticUri: string;
  /** Optional paired Live Photo video URI. iOS only. */
  videoUri?: string | null;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /**
   * When `true`, render as still even if `videoUri` is set. Use on heavy
   * surfaces (grid thumbnails, lists with many items) where looping multiple
   * videos would hurt scroll performance.
   */
  previewOnly?: boolean;
  /** Hide the small "LIVE" badge that appears when looping. */
  hideBadge?: boolean;
  /** Ignore the user's Live Photo playback setting (e.g. onboarding montage). */
  forceLivePlayback?: boolean;
}

/**
 * Renders a Live Photo as a looping muted video on iOS when the setting is
 * enabled and a paired video URI is provided. Falls back to the static
 * image otherwise (Android, setting disabled, no paired video, or
 * `previewOnly`). The component is API-compatible with `Image` for the
 * common props it needs.
 */
export function LivePhotoImage({
  staticUri,
  videoUri,
  style,
  contentFit = "cover",
  previewOnly = false,
  hideBadge = false,
  forceLivePlayback = false,
}: LivePhotoImageProps) {
  const { colors } = useTheme();
  const livePhotoEnabled = useSettingsStore((s) => s.livePhotoPlaybackEnabled);

  const shouldLoop = Boolean(
    videoUri &&
      (forceLivePlayback || livePhotoEnabled) &&
      Platform.OS === "ios" &&
      !previewOnly
  );

  const player = useVideoPlayer(shouldLoop ? videoUri ?? null : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const badge = useMemo(
    () =>
      shouldLoop && !hideBadge ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 9999,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 10,
              color: "#FFFFFF",
              letterSpacing: 0.6,
            }}
          >
            LIVE
          </Text>
        </View>
      ) : null,
    [shouldLoop, hideBadge]
  );

  if (shouldLoop) {
    return (
      <View
        style={[
          { backgroundColor: colors.surfaceSecondary, overflow: "hidden" },
          style,
        ]}
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit={contentFit === "contain" ? "contain" : "cover"}
          nativeControls={false}
          allowsPictureInPicture={false}
        />
        {badge}
      </View>
    );
  }

  return (
    <View style={style}>
      <Image
        source={{ uri: staticUri }}
        style={{ width: "100%", height: "100%" }}
        contentFit={contentFit}
        cachePolicy="memory-disk"
      />
    </View>
  );
}
