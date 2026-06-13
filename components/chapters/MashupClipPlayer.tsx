import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { useTheme } from "@/hooks/useTheme";
import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
  resolvePairedVideoUriAsync,
} from "@/lib/entryMediaUrl";
import type { MashupClip } from "@/lib/mashupBuckets";
import {
  enqueuePrefetch,
  getCachedUriSync,
} from "@/lib/mediaPrefetch";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSettingsStore } from "@/store/settingsStore";

export const CLIP_DURATION_MS = 2000;
const CROSSFADE_MS = 420;

export interface MashupClipPlayerProps {
  clips: MashupClip[];
  isActive: boolean;
  loop: boolean;
  onClipChange?: (index: number) => void;
  onComplete?: () => void;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  forceStill?: boolean;
  crossfade?: boolean;
  /** When set, the parent owns clip index (tap-to-skip, etc.). */
  activeClipIndex?: number;
}

export function MashupClipPlayer({
  clips,
  isActive,
  loop,
  onClipChange,
  onComplete,
  style,
  contentFit = "cover",
  forceStill = false,
  crossfade = true,
  activeClipIndex,
}: MashupClipPlayerProps) {
  const [internalIdx, setInternalIdx] = useState(0);
  const [topIdx, setTopIdx] = useState(0);
  const [underIdx, setUnderIdx] = useState(0);
  const completedRef = useRef(false);
  const prevIdxRef = useRef(0);
  const incomingOpacity = useSharedValue(1);
  const outgoingOpacity = useSharedValue(1);

  const effectiveIdx =
    activeClipIndex !== undefined ? activeClipIndex : internalIdx;

  useEffect(() => {
    setInternalIdx(0);
    setTopIdx(0);
    setUnderIdx(0);
    prevIdxRef.current = 0;
    incomingOpacity.value = 1;
    outgoingOpacity.value = 1;
    completedRef.current = false;
  }, [clips, incomingOpacity, outgoingOpacity]);

  const runCrossfade = (from: number, to: number) => {
    if (from === to) return;
    if (crossfade && !forceStill) {
      setUnderIdx(from);
      setTopIdx(to);
      outgoingOpacity.value = 1;
      incomingOpacity.value = 0;
      outgoingOpacity.value = withTiming(0, {
        duration: CROSSFADE_MS,
        easing: Easing.out(Easing.cubic),
      });
      incomingOpacity.value = withTiming(
        1,
        { duration: CROSSFADE_MS, easing: Easing.out(Easing.cubic) },
        (done) => {
          if (done) runOnJS(setUnderIdx)(to);
        }
      );
    } else {
      setTopIdx(to);
      setUnderIdx(to);
      incomingOpacity.value = 1;
      outgoingOpacity.value = 1;
    }
  };

  useEffect(() => {
    if (effectiveIdx === prevIdxRef.current) return;
    const from = prevIdxRef.current;
    prevIdxRef.current = effectiveIdx;
    runCrossfade(from, effectiveIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIdx, crossfade, forceStill]);

  useEffect(() => {
    if (!isActive || clips.length === 0) return;
    if (activeClipIndex !== undefined) return;

    if (!loop && internalIdx >= clips.length - 1) {
      const t = setTimeout(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete?.();
      }, CLIP_DURATION_MS);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      const next = internalIdx + 1;
      if (next >= clips.length) {
        if (loop) {
          setInternalIdx(0);
          onClipChange?.(0);
        }
      } else {
        setInternalIdx(next);
        onClipChange?.(next);
      }
    }, CLIP_DURATION_MS);
    return () => clearTimeout(t);
  }, [
    internalIdx,
    isActive,
    clips,
    loop,
    onClipChange,
    onComplete,
    activeClipIndex,
  ]);

  const incomingStyle = useAnimatedStyle(() => ({
    opacity: incomingOpacity.value,
  }));
  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: outgoingOpacity.value,
  }));

  if (clips.length === 0) {
    return <View style={[style, styles.empty]} />;
  }

  const playMotion = !forceStill;
  const underClip = clips[Math.min(underIdx, clips.length - 1)];
  const topClip = clips[Math.min(topIdx, clips.length - 1)];
  const showUnder = crossfade && !forceStill && underIdx !== topIdx;

  return (
    <View style={[style, styles.root]}>
      {showUnder ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, outgoingStyle]}
          pointerEvents="none"
        >
          <ClipSurface
            key={`under-${underClip.media.id}-${underIdx}`}
            clip={underClip}
            contentFit={contentFit}
            playMotion={playMotion}
          />
        </Animated.View>
      ) : null}
      <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]}>
        <ClipSurface
          key={`top-${topClip.media.id}-${topIdx}`}
          clip={topClip}
          contentFit={contentFit}
          playMotion={playMotion}
        />
      </Animated.View>
    </View>
  );
}

function ClipSurface({
  clip,
  contentFit,
  playMotion,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
  playMotion: boolean;
}) {
  const { colors } = useTheme();
  const livePhotoEnabled = useSettingsStore((s) => s.livePhotoPlaybackEnabled);
  const isVideo = clip.media.media_type === "video";
  const hasPaired = Boolean(
    clip.media.paired_video_storage_path || clip.media.paired_video_storage_url
  );

  if (isVideo && playMotion) {
    const cachedVideo = getCachedUriSync(clip.media, "video");
    if (cachedVideo?.startsWith("file:")) {
      return (
        <FullVideoClip
          clip={clip}
          contentFit={contentFit}
          fallbackBg={colors.surfaceSecondary}
        />
      );
    }
    return <KenBurnsStill clip={clip} contentFit={contentFit} />;
  }

  const usePaired =
    playMotion && hasPaired && livePhotoEnabled && Platform.OS === "ios";
  if (usePaired) {
    return (
      <LivePhotoClip
        clip={clip}
        contentFit={contentFit}
        fallbackBg={colors.surfaceSecondary}
      />
    );
  }

  if (playMotion) {
    return <KenBurnsStill clip={clip} contentFit={contentFit} />;
  }

  return (
    <EntryMediaImage
      media={clip.media}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
    />
  );
}

function KenBurnsStill({
  clip,
  contentFit,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
}) {
  const scale = useSharedValue(1);
  const cachedUri =
    getCachedUriSync(clip.media, "still") ||
    getCachedUriSync(clip.media, "video") ||
    getEntryMediaDisplayUri(clip.media) ||
    null;

  useEffect(() => {
    scale.value = 1;
    scale.value = withTiming(1.1, {
      duration: CLIP_DURATION_MS,
      easing: Easing.linear,
    });
  }, [clip.media.id, scale]);

  const motionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, styles.kenBurnsClip]}>
      <Animated.View style={[StyleSheet.absoluteFill, motionStyle]}>
        {cachedUri ? (
          <Image
            source={{ uri: cachedUri }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            cachePolicy="memory-disk"
          />
        ) : (
          <EntryMediaImage
            media={clip.media}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
          />
        )}
      </Animated.View>
    </View>
  );
}

function FullVideoClip({
  clip,
  contentFit,
  fallbackBg,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
  fallbackBg: string;
}) {
  const [uri, setUri] = useState<string | null>(() => {
    const cached = getCachedUriSync(clip.media, "video");
    if (cached) return cached;
    return getEntryMediaDisplayUri(clip.media) || null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    const cached = getCachedUriSync(clip.media, "video");
    const sync = getEntryMediaDisplayUri(clip.media);
    setUri(cached || sync || null);
    if (cached) return;

    enqueuePrefetch(clip.media, 2000);
    let cancelled = false;
    void (async () => {
      try {
        const resolved = await resolveEntryMediaUriAsync(clip.media);
        if (cancelled) return;
        const nowCached = getCachedUriSync(clip.media, "video");
        if (nowCached) setUri(nowCached);
        else if (resolved) setUri(resolved);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.media.id]);

  const player = useVideoPlayer(failed ? null : uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  if (failed || !uri) {
    return <KenBurnsStill clip={clip} contentFit={contentFit} />;
  }

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

function LivePhotoClip({
  clip,
  contentFit,
  fallbackBg,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
  fallbackBg: string;
}) {
  const [stillUri, setStillUri] = useState<string | null>(() => {
    return (
      getCachedUriSync(clip.media, "still") ||
      getEntryMediaDisplayUri(clip.media) ||
      null
    );
  });
  const [pairedUri, setPairedUri] = useState<string | null>(() => {
    return getCachedUriSync(clip.media, "paired");
  });

  useEffect(() => {
    const cachedStill = getCachedUriSync(clip.media, "still");
    const cachedPaired = getCachedUriSync(clip.media, "paired");
    setStillUri(cachedStill || getEntryMediaDisplayUri(clip.media) || null);
    setPairedUri(cachedPaired);

    enqueuePrefetch(clip.media, 2500);
    let cancelled = false;
    void (async () => {
      try {
        const [resolvedStill, resolvedPaired] = await Promise.all([
          resolveEntryMediaUriAsync(clip.media),
          resolvePairedVideoUriAsync(clip.media),
        ]);
        if (cancelled) return;
        const nowStill = getCachedUriSync(clip.media, "still");
        const nowPaired = getCachedUriSync(clip.media, "paired");
        if (nowStill) setStillUri(nowStill);
        else if (resolvedStill) setStillUri(resolvedStill);
        if (nowPaired) setPairedUri(nowPaired);
        else if (resolvedPaired) setPairedUri(resolvedPaired);
      } catch {
        /* Ken Burns fallback below */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clip.media.id]);

  const playablePaired =
    pairedUri &&
    (pairedUri.startsWith("file:") ||
      pairedUri.startsWith("http://") ||
      pairedUri.startsWith("https://"));

  const player = useVideoPlayer(playablePaired ? pairedUri : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  if (!stillUri && !pairedUri) {
    return <KenBurnsStill clip={clip} contentFit={contentFit} />;
  }

  if (!playablePaired) {
    return stillUri ? (
      <KenBurnsStill clip={clip} contentFit={contentFit} />
    ) : (
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]}
      />
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: fallbackBg }]}>
      {stillUri ? (
        <Image
          source={{ uri: stillUri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
        />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    backgroundColor: "#111111",
  },
  empty: {
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  kenBurnsClip: {
    overflow: "hidden",
  },
});
