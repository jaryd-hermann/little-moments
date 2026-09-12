import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import type { MediaAsset } from "@/hooks/useMediaLibrary";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

const CLIP_MS = 2000;

/**
 * Single montage cell — one clip visible at a time. Uses DayAssetPreview so
 * camera-roll videos and Live Photos share the same device-safe playback path.
 */
function MontageClip({ asset }: { asset: MediaAsset }) {
  return (
    <DayAssetPreview asset={asset} animate forceLivePlayback />
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

  if (assets.length === 0) {
    return (
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#111" }]} />
    );
  }

  const asset = assets[idx] ?? assets[0];

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MontageClip key={asset.id} asset={asset} />
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
