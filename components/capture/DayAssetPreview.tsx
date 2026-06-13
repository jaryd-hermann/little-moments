import { LivePhotoImage } from "@/components/common/LivePhotoImage";
import {
  getLivePhotoVideoUri,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

/**
 * Inline asset preview — looping muted video for clips and Live Photos,
 * still image otherwise.
 *
 * Pass `animate={false}` on grids / off-screen carousel cells to avoid
 * spawning many concurrent Photos `requestAVAsset` calls (can crash iOS).
 */
export function DayAssetPreview({
  asset,
  animate = true,
  forceLivePlayback = false,
}: {
  asset: MediaAsset;
  animate?: boolean;
  forceLivePlayback?: boolean;
}) {
  const isVideo = asset.mediaType === "video";
  const [liveVideoUri, setLiveVideoUri] = useState<string | null>(null);

  /** `ph://` URIs crash iOS when passed to expo-video — only play file/http. */
  const playableVideoUri = useMemo(() => {
    if (!isVideo) return null;
    const uri = asset.uri;
    if (uri.startsWith("file://") || uri.startsWith("http")) return uri;
    return null;
  }, [asset.uri, isVideo]);

  const player = useVideoPlayer(
    animate && playableVideoUri ? playableVideoUri : null,
    (p) => {
      p.loop = true;
      p.muted = true;
      p.play();
    }
  );

  useEffect(() => {
    if (!animate || isVideo) {
      setLiveVideoUri(null);
      return;
    }
    setLiveVideoUri(null);
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
  }, [asset.id, isVideo, animate]);

  if (!animate) {
    return (
      <Image
        source={{ uri: asset.uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />
    );
  }

  if (isVideo) {
    if (playableVideoUri && animate) {
      return (
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      );
    }
    return (
      <View
        style={{
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111111",
        }}
      >
        <ActivityIndicator color="rgba(255,255,255,0.65)" />
      </View>
    );
  }

  return (
    <LivePhotoImage
      staticUri={asset.uri}
      videoUri={liveVideoUri}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      hideBadge
      forceLivePlayback={forceLivePlayback}
    />
  );
}
