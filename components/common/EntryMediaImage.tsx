import { useEffect, useRef, useState } from "react";
import {
  View,
  Image as RNImage,
  Platform,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
  type NativeSyntheticEvent,
  type ImageLoadEventData as RNImageLoadEventData,
  StyleSheet,
} from "react-native";
// `/legacy`: `cacheDirectory` isn't on the current API, so importing the new
// one leaves it undefined and silently skips every download below.
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import type { EntryMedia } from "@/store/entryStore";
import {
  getEntryMediaDisplayUri,
  getPairedVideoDisplayUri,
  resolveEntryMediaUriAsync,
  resolvePairedVideoUriAsync,
  getStorageImageHeadersSync,
  isSupabaseStorageObjectUrl,
} from "@/lib/entryMediaUrl";
import { getCachedUriSync } from "@/lib/mediaPrefetch";
import { peekVideoPosterUri, resolveVideoPosterUri } from "@/lib/videoPoster";
import { resolvePairedVideoFromCameraRoll } from "@/lib/livePhotoBackfill";
import { useSettingsStore } from "@/store/settingsStore";
import { Shimmer } from "@/components/common/Shimmer";

interface EntryMediaImageProps {
  media: EntryMedia;
  style?: StyleProp<ViewStyle>;
  recyclingKey?: string;
  /** Defaults to cover. Use contain for letterboxed full-screen previews. */
  contentFit?: "cover" | "contain" | "fill" | "scale-down";
  /** Called with decoded pixel size when the image loads (both expo-image and RN fallback). */
  onLoad?: (size: { width: number; height: number }) => void;
  /**
   * Opt in to Live Photo looping for this surface. Off by default so list
   * thumbnails and grids stay cheap; the entry detail, flipbook foreground
   * card, and full-screen chapter slides pass `enableLivePhoto`.
   * Requires the media row to have paired video storage AND the user
   * to have `livePhotoPlaybackEnabled` AND iOS at runtime.
   */
  enableLivePhoto?: boolean;
  /**
   * Cross-fade transition (ms) applied by `expo-image` when the bitmap
   * becomes available. Useful for grid surfaces where images stream in as
   * the user scrolls — a short fade hides the "pop" of newly-resolved
   * thumbnails. Has no effect when we fall back to RN Image.
   */
  transition?: number;
  /** Show a shimmer placeholder until the still (or Live Photo video) is ready. */
  showLoadingShimmer?: boolean;
  /**
   * Mashup montage: when paired video was never uploaded, try recovering the
   * Live Photo loop from the camera roll via `taken_at`.
   */
  tryCameraRollLive?: boolean;
  /** Fired once when Live Photo motion is visible (first video frame). */
  onLiveMotionStart?: () => void;
  /**
   * Mashup montage: render only the Live Photo video — no still frame underneath.
   * Waits on a dark surface until motion is ready so clips feel like a movie.
   */
  livePhotoMotionOnly?: boolean;
}

type SourceShape = { uri: string; headers?: Record<string, string> };

function flattenImageStyle(style: StyleProp<ViewStyle>): ImageStyle {
  const f = StyleSheet.flatten(style) as ImageStyle;
  return f ?? {};
}

function sourceForUri(uri: string): SourceShape {
  if (uri.startsWith("file:")) {
    return { uri };
  }
  if (isSupabaseStorageObjectUrl(uri)) {
    return { uri };
  }
  return { uri, headers: getStorageImageHeadersSync() };
}

function hasPairedVideo(media: EntryMedia): boolean {
  return Boolean(
    media.paired_video_storage_path?.trim() ||
      media.paired_video_storage_url?.trim()
  );
}

function hasPairedVideoSource(media: EntryMedia): boolean {
  return hasPairedVideo(media) || Boolean(getCachedUriSync(media, "paired"));
}

/**
 * The remote bytes as a local file, downloaded once and reused on later mounts.
 * Null when there's no cache to write to or the fetch failed, in which case
 * callers stay on the remote URL.
 */
async function cacheRemoteToFile(
  mediaId: string,
  remote: string,
  ext: "jpg" | "mp4"
): Promise<string | null> {
  if (!FileSystem.cacheDirectory || !remote.startsWith("http")) return null;
  const path = `${FileSystem.cacheDirectory}lm-em-${mediaId}.${ext}`;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && (info.size ?? 0) > 0) return info.uri;
    const dl = await FileSystem.downloadAsync(remote, path);
    return dl.status === 200 ? dl.uri : null;
  } catch {
    return null;
  }
}

/**
 * Still frame for a video row. `Image` can't decode an mp4, so without this a
 * video moment renders as an empty tile wherever it appears in a list or grid.
 * Thumbnailing wants a local file — handed a remote URL, AVFoundation streams
 * the whole clip — so reuse whatever copy is already on disk first.
 */
async function resolveVideoStill(media: EntryMedia): Promise<string | null> {
  const peeked = peekVideoPosterUri(media.id);
  if (peeked) return peeked;

  const cached = getCachedUriSync(media, "video");
  let source = cached?.startsWith("file:") ? cached : null;

  if (!source) {
    const remote =
      (await resolveEntryMediaUriAsync(media)) || getEntryMediaDisplayUri(media);
    if (!remote) return null;
    source = (await cacheRemoteToFile(media.id, remote, "mp4")) ?? remote;
  }

  return resolveVideoPosterUri(media.id, source, 0);
}

export function EntryMediaImage({
  media,
  style,
  recyclingKey,
  contentFit = "cover",
  onLoad,
  enableLivePhoto = false,
  transition,
  showLoadingShimmer = false,
  tryCameraRollLive = false,
  onLiveMotionStart,
  livePhotoMotionOnly = false,
}: EntryMediaImageProps) {
  const motionStartFiredRef = useRef(false);
  const fireLiveMotionStart = () => {
    if (motionStartFiredRef.current) return;
    motionStartFiredRef.current = true;
    onLiveMotionStart?.();
  };

  useEffect(() => {
    motionStartFiredRef.current = false;
  }, [media.id]);
  const [displayUri, setDisplayUri] = useState<string | null>(() => {
    // A video's own URI is an mp4, which would only fail to decode — wait for
    // the poster instead.
    if (media.media_type === "video") return peekVideoPosterUri(media.id);
    const cachedStill = getCachedUriSync(media, "still");
    if (cachedStill) return cachedStill;
    const syncUri = getEntryMediaDisplayUri(media);
    return syncUri || null;
  });
  const [pairedVideoUri, setPairedVideoUri] = useState<string | null>(() => {
    const cachedPaired = getCachedUriSync(media, "paired");
    if (cachedPaired) return cachedPaired;
    const sync = getPairedVideoDisplayUri(media);
    return sync || null;
  });
  const [useRnFallback, setUseRnFallback] = useState(false);
  const [stillLoaded, setStillLoaded] = useState(false);
  const livePhotoEnabled = useSettingsStore((s) => s.livePhotoPlaybackEnabled);
  const wantsLivePhoto =
    enableLivePhoto &&
    livePhotoEnabled &&
    Platform.OS === "ios" &&
    media.media_type !== "video" &&
    (hasPairedVideoSource(media) ||
      (tryCameraRollLive && Boolean(media.taken_at)));
  const livePhotoActive = Boolean(wantsLivePhoto && pairedVideoUri);
  const [liveVideoReady, setLiveVideoReady] = useState(() =>
    Boolean(pairedVideoUri?.startsWith("file:"))
  );
  const [liveVideoFailed, setLiveVideoFailed] = useState(false);
  const livePhotoLoopActive = livePhotoActive && !liveVideoFailed;
  const livePhotoPlayer = useVideoPlayer(
    livePhotoLoopActive ? pairedVideoUri : null,
    (p) => {
      p.loop = true;
      p.muted = true;
      p.play();
    }
  );

  useEffect(() => {
    if (!livePhotoLoopActive || !onLiveMotionStart) return;
    if (!pairedVideoUri?.startsWith("file:")) return;
    const t = setTimeout(() => fireLiveMotionStart(), 80);
    return () => clearTimeout(t);
  }, [livePhotoLoopActive, pairedVideoUri, media.id, onLiveMotionStart]);

  useEffect(() => {
    if (pairedVideoUri?.startsWith("file:")) {
      setLiveVideoReady(true);
      setLiveVideoFailed(false);
      return;
    }
    setLiveVideoReady(false);
    setLiveVideoFailed(false);
    if (!livePhotoActive || !pairedVideoUri) return;
    const t = setTimeout(() => setLiveVideoFailed(true), 3500);
    return () => clearTimeout(t);
  }, [livePhotoActive, pairedVideoUri, media.id]);

  useEffect(() => {
    if (!wantsLivePhoto || livePhotoLoopActive) return;
    if (!liveVideoFailed || !displayUri) return;
    fireLiveMotionStart();
  }, [wantsLivePhoto, livePhotoLoopActive, liveVideoFailed, displayUri]);

  useEffect(() => {
    if (!wantsLivePhoto) {
      setPairedVideoUri(null);
      return;
    }

    const cachedPaired = getCachedUriSync(media, "paired");
    if (cachedPaired) {
      setPairedVideoUri(cachedPaired);
      return;
    }

    let cancelled = false;
    void (async () => {
      if (hasPairedVideo(media)) {
        const uri = await resolvePairedVideoUriAsync(media);
        if (!cancelled && uri) setPairedVideoUri(uri);
        return;
      }
      if (tryCameraRollLive && media.taken_at) {
        const rollUri = await resolvePairedVideoFromCameraRoll(media);
        if (!cancelled && rollUri) setPairedVideoUri(rollUri);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    media.id,
    media.paired_video_storage_path,
    media.paired_video_storage_url,
    media.taken_at,
    wantsLivePhoto,
    tryCameraRollLive,
  ]);

  // Pick up motion files as the prefetch worker finishes (mashup montage).
  useEffect(() => {
    if (!wantsLivePhoto) return;
    if (pairedVideoUri?.startsWith("file:")) return;

    const poll = setInterval(() => {
      const cached = getCachedUriSync(media, "paired");
      if (cached) setPairedVideoUri(cached);
    }, 80);
    const stop = setTimeout(() => clearInterval(poll), 12000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [wantsLivePhoto, media.id, pairedVideoUri]);

  useEffect(() => {
    let cancelled = false;
    setUseRnFallback(false);
    setStillLoaded(false);

    if (media.media_type === "video") {
      void (async () => {
        const poster = await resolveVideoStill(media);
        if (cancelled || !poster) return;
        setDisplayUri(poster);
        setStillLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }

    const cachedStill = getCachedUriSync(media, "still");
    if (cachedStill?.startsWith("file:")) {
      setDisplayUri(cachedStill);
      setStillLoaded(true);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const syncUri = getEntryMediaDisplayUri(media);
      if (!media.storage_path && !syncUri) {
        if (!cancelled) setDisplayUri(null);
        return;
      }

      try {
        const remote = await resolveEntryMediaUriAsync(media);
        if (cancelled) return;
        if (!remote) {
          setDisplayUri(syncUri || null);
          return;
        }

        const cachedFile = await cacheRemoteToFile(media.id, remote, "jpg");
        if (cancelled) return;
        if (cachedFile) {
          if (__DEV__) {
            console.log("[EntryMediaImage] cached to file", media.id);
          }
          setDisplayUri(cachedFile);
          setStillLoaded(true);
          return;
        }

        setDisplayUri(remote);
      } catch (e) {
        if (__DEV__) {
          console.warn("[EntryMediaImage] load failed, using sync URI", media.id, e);
        }
        if (!cancelled) setDisplayUri(syncUri || null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [media]);

  const expectingMedia = Boolean(
    media.storage_path?.trim() || media.storage_url?.trim()
  );
  const mediaReady = livePhotoLoopActive
    ? liveVideoReady || Boolean(displayUri)
    : displayUri
      ? stillLoaded
      : !expectingMedia;

  const shimmerHostStyle = [
    style,
    { overflow: "hidden" as const, backgroundColor: "rgba(128,128,128,0.12)" },
  ];

  if (!displayUri && !wantsLivePhoto) {
    if (showLoadingShimmer && expectingMedia) {
      return (
        <View style={shimmerHostStyle}>
          <Shimmer active skewDeg={0} />
        </View>
      );
    }
    return (
      <View
        style={[
          style,
          { backgroundColor: "rgba(128,128,128,0.2)" },
        ]}
      />
    );
  }

  const showShimmerOverlay =
    showLoadingShimmer && !mediaReady && (displayUri || livePhotoActive);

  const liveVideoView = livePhotoLoopActive ? (
    <VideoView
      player={livePhotoPlayer}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit === "contain" ? "contain" : "cover"}
      nativeControls={false}
      allowsPictureInPicture={false}
      onFirstFrameRender={() => {
        setLiveVideoReady(true);
        setLiveVideoFailed(false);
        fireLiveMotionStart();
      }}
    />
  ) : null;

  // Mashup montage: video only — no still flash before motion.
  if (wantsLivePhoto && livePhotoMotionOnly) {
    if (livePhotoLoopActive) {
      return <View style={style}>{liveVideoView}</View>;
    }

    if (liveVideoFailed && displayUri) {
      const stillSrc = sourceForUri(displayUri);
      const stillExpoSource = stillSrc.headers
        ? { uri: displayUri, headers: stillSrc.headers }
        : { uri: displayUri };
      return (
        <View style={style}>
          <Image
            source={stillExpoSource}
            style={{ width: "100%", height: "100%" }}
            contentFit={contentFit}
            cachePolicy="memory-disk"
            onLoad={(e) => {
              const w = e.source?.width ?? 0;
              const h = e.source?.height ?? 0;
              if (w > 0 && h > 0) onLoad?.({ width: w, height: h });
              fireLiveMotionStart();
            }}
          />
        </View>
      );
    }

    return <View style={[style, styles.motionOnlyWaiting]} />;
  }

  // Live Photo: still underneath, native loop on top. Use `wantsLivePhoto` so
  // mashup montages stay in this path while paired video resolves.
  if (wantsLivePhoto) {
    const stillSrc = displayUri ? sourceForUri(displayUri) : null;
    const stillExpoSource =
      stillSrc && displayUri
        ? stillSrc.headers
          ? { uri: displayUri, headers: stillSrc.headers }
          : { uri: displayUri }
        : null;

    return (
      <View style={style}>
        {stillExpoSource ? (
          <Image
            source={stillExpoSource}
            style={{ width: "100%", height: "100%" }}
            contentFit={contentFit}
            cachePolicy="memory-disk"
            onLoad={(e) => {
              const w = e.source?.width ?? 0;
              const h = e.source?.height ?? 0;
              setStillLoaded(true);
              if (w > 0 && h > 0) onLoad?.({ width: w, height: h });
            }}
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(128,128,128,0.2)" },
            ]}
          />
        )}
        {livePhotoLoopActive ? liveVideoView : null}
        {showShimmerOverlay ? (
          <Shimmer active skewDeg={0} style={StyleSheet.absoluteFill} />
        ) : null}
      </View>
    );
  }

  const src = sourceForUri(displayUri!);
  const plainUriOnly = !src.headers;
  const expoSource = plainUriOnly ? { uri: displayUri! } : { uri: displayUri!, headers: src.headers! };
  const rnSource = expoSource;
  const flatStyle = flattenImageStyle(style);

  const rnResizeMode =
    contentFit === "contain"
      ? "contain"
      : contentFit === "fill"
        ? "stretch"
        : contentFit === "scale-down"
          ? "center"
          : "cover";

  const emitLoad = (width: number, height: number) => {
    setStillLoaded(true);
    if (width > 0 && height > 0) onLoad?.({ width, height });
  };

  const imageNode = useRnFallback ? (
    <RNImage
      source={rnSource}
      style={flatStyle}
      resizeMode={rnResizeMode}
      onLoad={(e: NativeSyntheticEvent<RNImageLoadEventData>) => {
        const { width, height } = e.nativeEvent.source;
        emitLoad(width, height);
      }}
      onError={(e) => {
        if (__DEV__) {
          console.warn(
            "[EntryMediaImage] RN Image failed",
            media.id,
            e.nativeEvent.error
          );
        }
      }}
    />
  ) : (
    <Image
      source={expoSource}
      style={flatStyle}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
      recyclingKey={recyclingKey ?? media.id}
      onLoad={(e) => {
        const w = e.source?.width ?? 0;
        const h = e.source?.height ?? 0;
        emitLoad(w, h);
      }}
      onError={(e) => {
        if (__DEV__) {
          console.warn(
            "[EntryMediaImage] expo-image failed, trying RN Image",
            media.id,
            e.error
          );
        }
        setUseRnFallback(true);
      }}
    />
  );

  if (!showShimmerOverlay) {
    return imageNode;
  }

  return (
    <View style={shimmerHostStyle}>
      {imageNode}
      <Shimmer active skewDeg={0} style={StyleSheet.absoluteFill} />
    </View>
  );
}

const styles = StyleSheet.create({
  motionOnlyWaiting: {
    backgroundColor: "#111111",
  },
});
