import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import {
  getEntryMediaDisplayUri,
} from "@/lib/entryMediaUrl";
import type { MashupClip } from "@/lib/mashupBuckets";
import {
  getCachedUriSync,
} from "@/lib/mediaPrefetch";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTwoSecondVideoLoop } from "@/hooks/useTwoSecondVideoLoop";

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
  /** Fired when the active clip's motion is playing (or still-only fallback). */
  onClipPlayheadStart?: (clipIndex: number) => void;
  /** Mount the next clip off-screen so AVFoundation decodes before the cut. */
  preloadNextClip?: boolean;
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
  onClipPlayheadStart,
  preloadNextClip = false,
}: MashupClipPlayerProps) {
  const [internalIdx, setInternalIdx] = useState(0);
  const [topIdx, setTopIdx] = useState(0);
  const [underIdx, setUnderIdx] = useState(0);
  const [playheadReady, setPlayheadReady] = useState(false);
  const completedRef = useRef(false);
  const prevIdxRef = useRef(0);
  const playheadStartedRef = useRef(false);
  const incomingOpacity = useSharedValue(1);
  const outgoingOpacity = useSharedValue(1);

  const effectiveIdx =
    activeClipIndex !== undefined ? activeClipIndex : internalIdx;
  const effectiveIdxRef = useRef(effectiveIdx);
  effectiveIdxRef.current = effectiveIdx;

  const markPlayheadStart = useCallback(() => {
    if (playheadStartedRef.current) return;
    playheadStartedRef.current = true;
    setPlayheadReady(true);
    onClipPlayheadStart?.(effectiveIdxRef.current);
  }, [onClipPlayheadStart]);

  useEffect(() => {
    setInternalIdx(0);
    setTopIdx(0);
    setUnderIdx(0);
    setPlayheadReady(false);
    prevIdxRef.current = 0;
    playheadStartedRef.current = false;
    incomingOpacity.value = 1;
    outgoingOpacity.value = 1;
    completedRef.current = false;
  }, [clips, incomingOpacity, outgoingOpacity]);

  useEffect(() => {
    playheadStartedRef.current = false;
    setPlayheadReady(false);
    if (!isActive || clips.length === 0) return;

    const clip = clips[Math.min(effectiveIdx, clips.length - 1)];
    const hasCachedMotion =
      !forceStill &&
      (getCachedUriSync(clip.media, "paired")?.startsWith("file:") ||
        getCachedUriSync(clip.media, "video")?.startsWith("file:"));

    let fastPath: ReturnType<typeof setTimeout> | undefined;
    if (hasCachedMotion) {
      fastPath = setTimeout(() => markPlayheadStart(), 120);
    }

    const fallback = setTimeout(() => markPlayheadStart(), hasCachedMotion ? 900 : 4500);
    return () => {
      if (fastPath) clearTimeout(fastPath);
      clearTimeout(fallback);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveIdx, isActive, clips.length, forceStill]);

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
    if (!isActive || clips.length === 0 || !playheadReady) return;
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
      playheadStartedRef.current = false;
      setPlayheadReady(false);
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
    playheadReady,
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
  const shouldPreloadNext =
    preloadNextClip &&
    playMotion &&
    isActive &&
    effectiveIdx < clips.length - 1;
  const preloadClip = shouldPreloadNext
    ? clips[Math.min(effectiveIdx + 1, clips.length - 1)]
    : null;

  return (
    <View style={[style, styles.root]}>
      {preloadClip ? (
        <View style={styles.preloadHost} pointerEvents="none">
          <ClipSurface
            key={`preload-${preloadClip.media.id}`}
            clip={preloadClip}
            contentFit={contentFit}
            playMotion={playMotion}
            warmOnly
          />
        </View>
      ) : null}
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
          onMotionStart={markPlayheadStart}
        />
      </Animated.View>
    </View>
  );
}

function ClipSurface({
  clip,
  contentFit,
  playMotion,
  onMotionStart,
  warmOnly = false,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
  playMotion: boolean;
  onMotionStart?: () => void;
  warmOnly?: boolean;
}) {
  useEffect(() => {
    if (warmOnly) return;
    if (!playMotion) onMotionStart?.();
  }, [warmOnly, playMotion, clip.media.id, onMotionStart]);

  if (!playMotion) {
    return (
      <EntryMediaImage
        media={clip.media}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
      />
    );
  }

  if (clip.media.media_type === "video") {
    return (
      <MashupVideoClip
        clip={clip}
        contentFit={contentFit}
        onMotionStart={warmOnly ? undefined : onMotionStart}
      />
    );
  }

  return (
    <EntryMediaImage
      media={clip.media}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
      enableLivePhoto
      tryCameraRollLive={Platform.OS === "ios"}
      livePhotoMotionOnly
      showLoadingShimmer={false}
      onLiveMotionStart={warmOnly ? undefined : onMotionStart}
    />
  );
}

/** Full-video moments: 2s loop from a disk-cached file (prefetch guarantees this). */
function MashupVideoClip({
  clip,
  contentFit,
  onMotionStart,
}: {
  clip: MashupClip;
  contentFit: "cover" | "contain";
  onMotionStart?: () => void;
}) {
  const [uri, setUri] = useState(
    () =>
      getCachedUriSync(clip.media, "video") ||
      getEntryMediaDisplayUri(clip.media) ||
      null
  );

  useEffect(() => {
    const cached = getCachedUriSync(clip.media, "video");
    if (cached) {
      setUri(cached);
      return;
    }
    const sync = getEntryMediaDisplayUri(clip.media);
    if (sync) setUri(sync);

    const deadline = Date.now() + 8000;
    const poll = setInterval(() => {
      const next = getCachedUriSync(clip.media, "video");
      if (next) {
        setUri(next);
        clearInterval(poll);
        return;
      }
      if (Date.now() >= deadline) clearInterval(poll);
    }, 80);
    return () => clearInterval(poll);
  }, [clip.media.id]);

  const fileUri = uri?.startsWith("file:") ? uri : null;

  const player = useVideoPlayer(fileUri, (p) => {
    p.loop = false;
    p.muted = true;
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  useTwoSecondVideoLoop(player, Boolean(fileUri));

  useEffect(() => {
    if (!fileUri || !onMotionStart) return;
    const t = setTimeout(() => onMotionStart(), 80);
    return () => clearTimeout(t);
  }, [fileUri, clip.media.id, onMotionStart]);

  if (!fileUri) {
    return <View style={[StyleSheet.absoluteFill, styles.waiting]} />;
  }

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit={contentFit}
      nativeControls={false}
      allowsPictureInPicture={false}
      onFirstFrameRender={() => onMotionStart?.()}
    />
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
  waiting: {
    backgroundColor: "#111111",
  },
  preloadHost: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    zIndex: -1,
  },
});
