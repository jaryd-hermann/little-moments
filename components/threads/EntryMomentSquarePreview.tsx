import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { useTheme } from "@/hooks/useTheme";
import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
} from "@/lib/entryMediaUrl";
import { resolveVideoPosterUri } from "@/lib/videoPoster";
import type { EntryMedia } from "@/store/entryStore";

type EntryMomentSquarePreviewProps = {
  media: EntryMedia;
  size: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Video square — poster + play button; taps mount the player and loop the clip. */
function EntryMomentVideoSquare({
  media,
  style,
}: {
  media: EntryMedia;
  style: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUri(null);
    setPoster(null);
    setPlaying(false);
    setReady(false);
    void (async () => {
      try {
        const resolved = await resolveEntryMediaUriAsync(media);
        const url = (resolved || getEntryMediaDisplayUri(media)).trim();
        if (cancelled || !url) return;
        setUri(url);
        const posterUri = await resolveVideoPosterUri(media.id, url, 0);
        if (!cancelled && posterUri) setPoster(posterUri);
      } catch {
        /* neutral surface + play button fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [media.id, media.media_type, media.storage_path, media.storage_url]);

  const player = useVideoPlayer(playing ? uri : null, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });

  const handlePlay = useCallback(() => {
    if (!uri) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPlaying(true);
  }, [uri, media.id]);

  return (
    <View style={style}>
      {poster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        />
      )}

      {playing ? (
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
          onFirstFrameRender={() => setReady(true)}
        />
      ) : null}

      {playing && !ready ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}

      {!playing ? (
        <Pressable
          onPress={handlePlay}
          disabled={!uri}
          style={styles.center}
          accessibilityLabel="Play video"
        >
          <View style={styles.playButton}>
            <Ionicons name="play" size={26} color="#FFFFFF" />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Square moment thumbnail — image, Live Photo, or tap-to-play video. */
export function EntryMomentSquarePreview({
  media,
  size,
  borderRadius = 12,
  style,
}: EntryMomentSquarePreviewProps) {
  const { colors } = useTheme();
  const frameStyle = {
    width: size,
    height: size,
    borderRadius,
    overflow: "hidden" as const,
    backgroundColor: colors.surfaceSecondary,
  };

  if (media.media_type === "video") {
    return <EntryMomentVideoSquare media={media} style={[frameStyle, style]} />;
  }

  return (
    <EntryMediaImage
      media={media}
      enableLivePhoto
      style={[frameStyle, style]}
      contentFit="cover"
      showLoadingShimmer
    />
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
