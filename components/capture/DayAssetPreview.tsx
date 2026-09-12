import { LivePhotoImage } from "@/components/common/LivePhotoImage";
import {
  getLivePhotoVideoUri,
  isPlayableMediaUri,
  resolveMediaAssetUri,
  resolveVideoPosterForAsset,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { useTwoSecondVideoLoop } from "@/hooks/useTwoSecondVideoLoop";
import { useTheme } from "@/hooks/useTheme";
import { isVideoFileUri, peekVideoPosterUri, resolveVideoPosterUri } from "@/lib/videoPoster";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

/**
 * Inline asset preview — looping muted video for clips and Live Photos,
 * still image otherwise.
 *
 * Pass `animate={false}` on grids / off-screen carousel cells to avoid
 * spawning many concurrent video players (uses JPEG poster frames instead).
 */
export function DayAssetPreview({
  asset,
  style,
  animate = true,
  forceLivePlayback = false,
  videoClipStartSec = 0,
}: {
  asset: MediaAsset;
  style?: object;
  animate?: boolean;
  forceLivePlayback?: boolean;
  videoClipStartSec?: number;
}) {
  const { colors } = useTheme();
  const isVideo = asset.mediaType === "video";
  const [liveVideoUri, setLiveVideoUri] = useState<string | null>(null);
  const [resolvedAsset, setResolvedAsset] = useState<MediaAsset | null>(null);
  const [posterUri, setPosterUri] = useState<string | null>(() =>
    isVideo ? peekVideoPosterUri(asset.id, videoClipStartSec) : null
  );
  const [videoReady, setVideoReady] = useState(false);

  const playableVideoUri = useMemo(() => {
    if (!isVideo) return null;
    const uri = resolvedAsset?.uri ?? asset.uri;
    return isPlayableMediaUri(uri) ? uri : null;
  }, [asset.uri, isVideo, resolvedAsset]);

  const stillUri = useMemo(() => {
    if (!isVideo) return asset.uri;
    if (posterUri) return posterUri;
    const raw = resolvedAsset?.uri ?? asset.uri;
    if (isVideoFileUri(raw)) return null;
    return raw;
  }, [asset.uri, isVideo, posterUri, resolvedAsset]);

  useEffect(() => {
    if (!isVideo || !animate) {
      return;
    }
    let cancelled = false;
    void resolveMediaAssetUri(asset).then((resolved) => {
      if (!cancelled) setResolvedAsset(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [asset, animate, isVideo]);

  useEffect(() => {
    setVideoReady(false);
  }, [asset.id, playableVideoUri]);

  useEffect(() => {
    if (!isVideo) return;
    const cached = peekVideoPosterUri(asset.id, videoClipStartSec);
    if (cached) {
      setPosterUri(cached);
      return;
    }
    let cancelled = false;
    void resolveVideoPosterForAsset(asset, videoClipStartSec).then((uri) => {
      if (!cancelled && uri) setPosterUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.uri, isVideo, videoClipStartSec]);

  useEffect(() => {
    if (!isVideo || !playableVideoUri) return;
    const cached = peekVideoPosterUri(asset.id, videoClipStartSec);
    if (cached) return;
    let cancelled = false;
    void resolveVideoPosterUri(
      asset.id,
      playableVideoUri,
      videoClipStartSec
    ).then((uri) => {
      if (!cancelled && uri) setPosterUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, isVideo, playableVideoUri, videoClipStartSec]);

  useEffect(() => {
    if (!animate || isVideo) {
      setLiveVideoUri(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const paired = await getLivePhotoVideoUri(asset.id);
        if (!cancelled && paired?.uri) setLiveVideoUri(paired.uri);
      } catch {
        /* still image fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, animate, isVideo]);

  const player = useVideoPlayer(
    animate && playableVideoUri ? playableVideoUri : null,
    (p) => {
      p.muted = true;
      p.loop = false;
      p.currentTime = videoClipStartSec;
      p.play();
    }
  );

  useTwoSecondVideoLoop(player, animate && isVideo, videoClipStartSec);

  useEffect(() => {
    if (!player || !animate || !isVideo) return;
    try {
      player.currentTime = videoClipStartSec;
      player.play();
    } catch {
      /* player may not be ready yet */
    }
  }, [animate, isVideo, player, videoClipStartSec]);

  if (!animate) {
    if (isVideo) {
      return (
        <View style={[styles.fill, style]}>
          {stillUri ? (
            <Image
              source={{ uri: stillUri }}
              style={styles.fill}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
              ]}
            >
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          )}
        </View>
      );
    }
    return (
      <Image
        source={{ uri: asset.uri }}
        style={[styles.fill, style]}
        contentFit="cover"
      />
    );
  }

  if (isVideo) {
    if (animate && !playableVideoUri) {
      return (
        <View style={[styles.fill, style]}>
          {stillUri ? (
            <Image
              source={{ uri: stillUri }}
              style={styles.fill}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                },
              ]}
            >
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          )}
        </View>
      );
    }

    if (!playableVideoUri) {
      return null;
    }

    return (
      <View style={[styles.fill, style]}>
        {stillUri ? (
          <Image
            source={{ uri: stillUri }}
            style={styles.fill}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.fill, { backgroundColor: colors.surfaceSecondary }]} />
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
        {!videoReady && !stillUri ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <LivePhotoImage
      staticUri={asset.uri}
      videoUri={liveVideoUri}
      style={[styles.fill, style]}
      contentFit="cover"
      hideBadge
      forceLivePlayback={forceLivePlayback}
    />
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
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
