import { LivePhotoImage } from "@/components/common/LivePhotoImage";
import {
  getLivePhotoVideoUri,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

const CLIP_MS = 2000;

/**
 * Single montage cell — never remount on clip change. Avoids overlapping
 * Photos `requestAVAsset` calls (crashes iOS when clips rotate quickly).
 * Camera-roll videos render as stills; Live Photos loop when resolved.
 */
function MontageClip({ asset }: { asset: MediaAsset }) {
  const [liveVideoUri, setLiveVideoUri] = useState<string | null>(null);
  const assetIdRef = useRef(asset.id);

  useEffect(() => {
    assetIdRef.current = asset.id;
    setLiveVideoUri(null);

    if (asset.mediaType === "video") return;

    let cancelled = false;
    void (async () => {
      try {
        const paired = await getLivePhotoVideoUri(asset.id);
        if (!cancelled && assetIdRef.current === asset.id && paired?.uri) {
          setLiveVideoUri(paired.uri);
        }
      } catch {
        /* still image fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.mediaType]);

  if (asset.mediaType === "video") {
    return (
      <Image
        source={{ uri: asset.uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />
    );
  }

  return (
    <LivePhotoImage
      staticUri={asset.uri}
      videoUri={liveVideoUri}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      hideBadge
      forceLivePlayback
    />
  );
}

export function GalleryMontageBackground({
  assets,
}: {
  assets: MediaAsset[];
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [assets]);

  useEffect(() => {
    if (assets.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % assets.length);
    }, CLIP_MS);
    return () => clearInterval(t);
  }, [assets.length]);

  useEffect(() => {
    if (assets.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const asset of assets) {
        if (cancelled || asset.mediaType === "video") continue;
        await getLivePhotoVideoUri(asset.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assets]);

  if (assets.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#111" }]} />
    );
  }

  const asset = assets[idx] ?? assets[0];

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MontageClip asset={asset} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: "rgba(0,0,0,0.35)" },
        ]}
      />
    </View>
  );
}
