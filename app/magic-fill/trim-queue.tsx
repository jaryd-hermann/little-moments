import { VideoTrimSheet } from "@/components/capture/VideoTrimSheet";
import type { MediaAsset } from "@/hooks/useMediaLibrary";
import { collectSelectedVideosFromDrafts } from "@/lib/magicFillYouPick";
import { useMagicFillStore } from "@/store/magicFillStore";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

export default function MagicFillTrimQueueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const drafts = useMagicFillStore((s) => s.drafts);
  const pickedVideoClips = useMagicFillStore((s) => s.pickedVideoClips);
  const setPickedVideoClip = useMagicFillStore((s) => s.setPickedVideoClip);

  const [current, setCurrent] = useState<MediaAsset | null>(null);
  const [trimIndex, setTrimIndex] = useState(1);
  const queueRef = useRef<MediaAsset[]>([]);
  const totalRef = useRef(0);

  useEffect(() => {
    const videos = collectSelectedVideosFromDrafts(drafts, pickedVideoClips);
    queueRef.current = videos;
    totalRef.current = videos.length;
    if (videos.length === 0) {
      router.replace("/magic-fill/caption-mode");
      return;
    }
    setTrimIndex(1);
    setCurrent(videos[0]);
    // Only initialize the queue on entry — advanceQueue handles the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  const advanceQueue = useCallback(() => {
    queueRef.current = queueRef.current.slice(1);
    const next = queueRef.current[0] ?? null;
    if (!next) {
      router.replace("/magic-fill/caption-mode");
      return;
    }
    setTrimIndex((i) => i + 1);
    setCurrent(next);
  }, []);

  const handleConfirm = useCallback(
    (result: {
      asset: MediaAsset;
      resolvedUri: string;
      clipStartSec: number;
    }) => {
      setPickedVideoClip(result.asset.id, {
        clipStartSec: result.clipStartSec,
        resolvedUri: result.resolvedUri,
      });
      advanceQueue();
    },
    [advanceQueue, setPickedVideoClip]
  );

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  if (!current) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: insets.top,
        }}
      >
        <ActivityIndicator color={colors.textSecondary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 24,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
          }}
        >
          Trimming video {trimIndex} of {totalRef.current}
        </Text>
      </View>

      <VideoTrimSheet
        visible={!!current}
        asset={current}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </View>
  );
}
