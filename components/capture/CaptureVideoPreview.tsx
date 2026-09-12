import {
  isPlayableMediaUri,
  resolveMediaAssetUri,
  resolveVideoPosterForAsset,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { peekVideoPosterUri } from "@/lib/videoPoster";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

type Props = {
  asset: MediaAsset;
  /** Pre-resolved file URI from carousel prefetch, when available. */
  resolvedUri?: string | null;
  /** Stop playback when the carousel scrolls away from this card. */
  isActive?: boolean;
};

/**
 * Carousel video card — static JPEG thumbnail by default, video loads only
 * when the user taps play. Play / pause / restart controls sit bottom-right.
 *
 * On device, full video copies are deferred until play so the serialized
 * Photos queue can prioritize poster frames for the visible card.
 */
export function CaptureVideoPreview({
  asset,
  resolvedUri,
  isActive = true,
}: Props) {
  const { colors } = useTheme();
  const [playableUri, setPlayableUri] = useState<string | null>(() =>
    resolvedUri && isPlayableMediaUri(resolvedUri) ? resolvedUri : null
  );
  const [posterUri, setPosterUri] = useState<string | null>(() =>
    peekVideoPosterUri(asset.id, 0)
  );
  const [posterLoading, setPosterLoading] = useState(
    () => !peekVideoPosterUri(asset.id, 0)
  );
  const [playing, setPlaying] = useState(false);
  const [resolvingPlayable, setResolvingPlayable] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!isActive) {
      setPlaying(false);
      setVideoReady(false);
      setResolvingPlayable(false);
    }
  }, [isActive]);

  useEffect(() => {
    if (resolvedUri && isPlayableMediaUri(resolvedUri)) {
      setPlayableUri(resolvedUri);
    }
  }, [resolvedUri]);

  useEffect(() => {
    if (!isActive) return;

    const cached = peekVideoPosterUri(asset.id, 0);
    if (cached) {
      setPosterUri(cached);
      setPosterLoading(false);
      return;
    }

    let cancelled = false;
    setPosterLoading(true);
    void resolveVideoPosterForAsset(asset, 0).then((uri) => {
      if (cancelled) return;
      if (uri) setPosterUri(uri);
      setPosterLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.uri, isActive]);

  const mountPlayer = playing && isActive && !!playableUri;

  const player = useVideoPlayer(mountPlayer ? playableUri : null, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (!player || !mountPlayer) return;
    try {
      player.play();
    } catch {
      /* not ready */
    }
  }, [mountPlayer, player]);

  const handlePlay = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (playableUri) {
      setPlaying(true);
      return;
    }

    setResolvingPlayable(true);
    void resolveMediaAssetUri(asset)
      .then((resolved) => {
        if (!isPlayableMediaUri(resolved.uri)) return;
        setPlayableUri(resolved.uri);
        setPlaying(true);
      })
      .finally(() => {
        setResolvingPlayable(false);
      });
  }, [asset, playableUri]);

  const handlePause = useCallback(() => {
    void Haptics.selectionAsync();
    try {
      player?.pause();
    } catch {
      /* ignore */
    }
    setPlaying(false);
    setVideoReady(false);
  }, [player]);

  const handleRestart = useCallback(() => {
    if (!playableUri) return;
    void Haptics.selectionAsync();
    try {
      player.currentTime = 0;
      player.play();
    } catch {
      setPlaying(true);
    }
  }, [playableUri, player]);

  const showPosterSpinner = isActive && posterLoading && !posterUri;
  const showPlaySpinner =
    isActive && (resolvingPlayable || (mountPlayer && !videoReady));

  return (
    <View style={styles.fill}>
      {posterUri ? (
        <Image
          source={{ uri: posterUri }}
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

      {mountPlayer ? (
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
      ) : null}

      {showPosterSpinner || showPlaySpinner ? (
        <View style={styles.centerOverlay}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : null}

      <View style={styles.controls} pointerEvents="box-none">
        {playing && isActive ? (
          <>
            <Pressable
              onPress={handlePause}
              style={[styles.controlBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
              accessibilityLabel="Pause video"
              hitSlop={8}
            >
              <Ionicons name="pause" size={16} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={handleRestart}
              style={[styles.controlBtn, { backgroundColor: "rgba(0,0,0,0.55)" }]}
              accessibilityLabel="Restart video"
              hitSlop={8}
            >
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={handlePlay}
            disabled={resolvingPlayable}
            style={[
              styles.controlBtn,
              {
                backgroundColor:
                  resolvingPlayable
                    ? "rgba(0,0,0,0.25)"
                    : "rgba(0,0,0,0.55)",
              },
            ]}
            accessibilityLabel="Play video"
            hitSlop={8}
          >
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
  videoLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  controls: {
    position: "absolute",
    bottom: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
  },
  controlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
