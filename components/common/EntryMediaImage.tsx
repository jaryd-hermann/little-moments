import { useEffect, useState } from "react";
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
import * as FileSystem from "expo-file-system";
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

export function EntryMediaImage({
  media,
  style,
  recyclingKey,
  contentFit = "cover",
  onLoad,
  enableLivePhoto = false,
  transition,
  showLoadingShimmer = false,
}: EntryMediaImageProps) {
  const [displayUri, setDisplayUri] = useState<string | null>(() => {
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
    hasPairedVideo(media);
  const livePhotoActive = Boolean(wantsLivePhoto && pairedVideoUri);
  const livePhotoPlayer = useVideoPlayer(
    livePhotoActive ? pairedVideoUri : null,
    (p) => {
      p.loop = true;
      p.muted = true;
      p.play();
    }
  );

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
    void resolvePairedVideoUriAsync(media).then((uri) => {
      if (!cancelled && uri) setPairedVideoUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [
    media.id,
    media.paired_video_storage_path,
    media.paired_video_storage_url,
    wantsLivePhoto,
  ]);

  useEffect(() => {
    let cancelled = false;
    setUseRnFallback(false);
    setStillLoaded(false);

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

        if (FileSystem.cacheDirectory && remote.startsWith("http")) {
          const ext = media.media_type === "video" ? "mp4" : "jpg";
          const path = `${FileSystem.cacheDirectory}lm-em-${media.id}.${ext}`;
          const dl = await FileSystem.downloadAsync(remote, path);
          if (cancelled) return;
          if (dl.status === 200) {
            if (__DEV__) {
              console.log("[EntryMediaImage] cached to file", media.id);
            }
            setDisplayUri(dl.uri);
            setStillLoaded(true);
            return;
          }
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
  const mediaReady = livePhotoActive
    ? Boolean(pairedVideoUri)
    : displayUri
      ? stillLoaded
      : !expectingMedia;

  const shimmerHostStyle = [
    style,
    { overflow: "hidden" as const, backgroundColor: "rgba(128,128,128,0.12)" },
  ];

  if (!displayUri && !livePhotoActive) {
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

  // Live Photo override: render the looping paired video on top of the still
  // surface. The still loads in the background so freshly mounted views (and
  // any contentFit / sizing logic) still get a `onLoad` event.
  if (livePhotoActive) {
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
            style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
            onLoad={(e) => {
              const w = e.source?.width ?? 0;
              const h = e.source?.height ?? 0;
              setStillLoaded(true);
              if (w > 0 && h > 0) onLoad?.({ width: w, height: h });
            }}
          />
        ) : null}
        <VideoView
          player={livePhotoPlayer}
          style={{ width: "100%", height: "100%" }}
          contentFit={contentFit === "contain" ? "contain" : "cover"}
          nativeControls={false}
          allowsPictureInPicture={false}
        />
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
