import { useTwoSecondVideoLoop } from "@/hooks/useTwoSecondVideoLoop";
import { useTheme } from "@/hooks/useTheme";
import {
  isVideoFileUri,
  peekVideoPosterUri,
  resolveVideoPosterUri,
} from "@/lib/videoPoster";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

type Props = {
  assetId: string;
  /** Resolved local file URI — required before playback. */
  videoUri: string | null;
  clipStartSec: number;
  /** Parent is still copying / resolving the file from the camera roll. */
  preparing?: boolean;
  /** Poster shown immediately while the full file resolves (e.g. cached carousel frame). */
  posterUriOverride?: string | null;
};

/**
 * Trim-sheet preview — loops the selected 2s window with explicit loading UI.
 */
export function VideoTrimPreview({
  assetId,
  videoUri,
  clipStartSec,
  preparing = false,
  posterUriOverride = null,
}: Props) {
  const { colors } = useTheme();
  const [posterUri, setPosterUri] = useState<string | null>(
    () =>
      peekVideoPosterUri(assetId, clipStartSec) ??
      peekVideoPosterUri(assetId, 0) ??
      posterUriOverride
  );
  const [videoReady, setVideoReady] = useState(false);

  const stillUri = useMemo(() => {
    if (posterUri) return posterUri;
    if (posterUriOverride) return posterUriOverride;
    if (videoUri && !isVideoFileUri(videoUri)) return videoUri;
    return null;
  }, [posterUri, posterUriOverride, videoUri]);

  useEffect(() => {
    setVideoReady(false);
  }, [videoUri]);

  useEffect(() => {
    if (!videoUri) return;
    let cancelled = false;
    const cached = peekVideoPosterUri(assetId, clipStartSec);
    if (cached) {
      setPosterUri(cached);
      return;
    }
    void resolveVideoPosterUri(assetId, videoUri, clipStartSec).then((uri) => {
      if (!cancelled && uri) setPosterUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [assetId, clipStartSec, videoUri]);

  const player = useVideoPlayer(preparing ? null : videoUri, (p) => {
    p.muted = true;
    p.loop = false;
    p.currentTime = clipStartSec;
    p.play();
  });

  useTwoSecondVideoLoop(player, !preparing && !!videoUri, clipStartSec);

  useEffect(() => {
    if (!player || preparing || !videoUri) return;
    try {
      player.currentTime = clipStartSec;
      player.play();
    } catch {
      /* player may not be ready yet */
    }
  }, [clipStartSec, player, preparing, videoUri]);

  if (preparing || !videoUri) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.surfaceSecondary }]}>
        {stillUri ? (
          <Image
            source={{ uri: stillUri }}
            style={styles.fill}
            contentFit="cover"
            transition={0}
            cachePolicy="memory-disk"
          />
        ) : null}
        <View style={[styles.fill, styles.center, styles.loadingOverlay]}>
          <ActivityIndicator color={colors.textSecondary} size="large" />
          <Text
            style={{
              marginTop: 12,
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: stillUri ? "#FFFFFF" : colors.textSecondary,
            }}
          >
            Loading video…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {stillUri ? (
        <Image
          source={{ uri: stillUri }}
          style={styles.fill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
      ) : (
        <View
          style={[styles.fill, { backgroundColor: colors.surfaceSecondary }]}
        />
      )}

      <VideoView
        player={player}
        style={[
          styles.fill,
          styles.videoLayer,
          { opacity: videoReady ? 1 : 0 },
        ]}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setVideoReady(true)}
      />

      {!videoReady ? (
        <View
          style={[
            styles.fill,
            styles.center,
            styles.loadingOverlay,
            { backgroundColor: "rgba(0,0,0,0.12)" },
          ]}
        >
          <ActivityIndicator color={colors.textSecondary} />
          <Text
            style={{
              marginTop: 10,
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: colors.textSecondary,
            }}
          >
            Preparing preview…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  videoLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
