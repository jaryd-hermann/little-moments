import {
  CLIP_DURATION_MS,
  MashupClipPlayer,
} from "@/components/chapters/MashupClipPlayer";
import { LocationTag } from "@/components/common/LocationTag";
import { useTheme } from "@/hooks/useTheme";
import {
  clipTitleText,
  formatClipTimestamp,
  type MashupBucket,
} from "@/lib/mashupBuckets";
import {
  enqueueClipsForPrefetch,
  waitForClipsReady,
} from "@/lib/mediaPrefetch";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type MashupCloseReason = "auto_end" | "user_x";

export interface MashupPlayerProps {
  visible: boolean;
  bucket: MashupBucket | null;
  onCompleteOrClose: (reason: MashupCloseReason, lastClipIndex: number) => void;
}

export function MashupPlayer({
  visible,
  bucket,
  onCompleteOrClose,
}: MashupPlayerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [clipIdx, setClipIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const closedRef = useRef(false);
  const clipIdxRef = useRef(0);
  clipIdxRef.current = clipIdx;

  const fireClose = useCallback(
    (reason: MashupCloseReason) => {
      if (closedRef.current) return;
      closedRef.current = true;
      onCompleteOrClose(reason, clipIdxRef.current);
    },
    [onCompleteOrClose]
  );

  useEffect(() => {
    if (!visible || !bucket) {
      setReady(false);
      return;
    }
    setClipIdx(0);
    closedRef.current = false;
    setReady(false);
    enqueueClipsForPrefetch(bucket.clips, 12000);
    const timeoutMs = Math.min(
      30000,
      8000 + bucket.clips.length * 500
    );
    void waitForClipsReady(bucket.clips, timeoutMs).then(() => setReady(true));
  }, [visible, bucket]);

  useEffect(() => {
    if (!visible || !bucket || !ready) return;
    enqueueClipsForPrefetch(
      bucket.clips.slice(clipIdx + 1, clipIdx + 4),
      11000
    );
  }, [visible, bucket, clipIdx, ready]);

  useEffect(() => {
    if (!visible || !bucket || !ready) return;
    const t = setTimeout(() => {
      if (clipIdx >= bucket.clips.length - 1) {
        fireClose("auto_end");
      } else {
        setClipIdx((i) => i + 1);
      }
    }, CLIP_DURATION_MS);
    return () => clearTimeout(t);
  }, [visible, bucket, clipIdx, ready, fireClose]);

  if (!bucket) return null;
  const clips = bucket.clips;
  const currentClip = clips[Math.min(clipIdx, clips.length - 1)];

  const goToMoment = () => {
    if (!currentClip) return;
    const entryId = currentClip.entry.id;
    fireClose("user_x");
    setTimeout(() => router.push(`/entry/${entryId}`), 200);
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={() => fireClose("user_x")}
    >
      <View style={[styles.root, { backgroundColor: "#111" }]}>
        {ready ? (
          <>
            <MashupClipPlayer
              clips={clips}
              isActive={visible}
              loop={false}
              crossfade={false}
              activeClipIndex={clipIdx}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />

            {/* Tap zones — back / forward through clips. */}
            <View
              style={StyleSheet.absoluteFill}
              pointerEvents="box-none"
            >
              <Pressable
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "34%",
                }}
                onPress={() => {
                  if (clipIdx > 0) setClipIdx((i) => i - 1);
                }}
              />
              <Pressable
                style={{
                  position: "absolute",
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: "34%",
                }}
                onPress={() => {
                  if (clipIdx < clips.length - 1) {
                    setClipIdx((i) => i + 1);
                  } else {
                    fireClose("auto_end");
                  }
                }}
              />
            </View>
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text
              style={{
                marginTop: 16,
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: "rgba(255,255,255,0.75)",
              }}
            >
              Stitching moments together…
            </Text>
          </View>
        )}

        <View
          style={{
            position: "absolute",
            top: insets.top + 12,
            left: 16,
            right: 16,
            flexDirection: "row",
            gap: 4,
          }}
        >
          {clips.map((_, i) => (
            <ProgressSegment
              key={i}
              state={
                i < clipIdx ? "filled" : i === clipIdx ? "active" : "empty"
              }
              durationMs={CLIP_DURATION_MS}
              isPaused={!ready}
            />
          ))}
        </View>

        <Pressable
          onPress={() => fireClose("user_x")}
          hitSlop={12}
          accessibilityLabel="Close mashup"
          style={{
            position: "absolute",
            top: insets.top + 28,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </Pressable>

        {ready && currentClip ? (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: insets.bottom + 40,
              alignItems: "center",
              gap: 12,
            }}
          >
            <Animated.View
              key={currentClip.media.id}
              entering={FadeInDown.duration(450).delay(60)}
              style={{ alignItems: "center", gap: 10, width: "100%" }}
            >
              <Text
                numberOfLines={3}
                style={{
                  fontFamily: "Roboto-Bold",
                  fontSize: 30,
                  lineHeight: 38,
                  color: "#FFFFFF",
                  textAlign: "center",
                  textShadowColor: "rgba(0,0,0,0.6)",
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 8,
                }}
              >
                {clipTitleText(currentClip)}
              </Text>
              <Pressable onPress={goToMoment} hitSlop={8}>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: colors.primary,
                    textDecorationLine: "underline",
                  }}
                >
                  Go back to moment
                </Text>
              </Pressable>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 9999,
                  backgroundColor: "rgba(0,0,0,0.55)",
                  maxWidth: "100%",
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    color: "#FFFFFF",
                    letterSpacing: 0.4,
                    textAlign: "center",
                  }}
                >
                  {formatClipTimestamp(currentClip)}
                </Text>
              </View>
              {currentClip.media.location_name ? (
                <LocationTag
                  name={currentClip.media.location_name}
                  variant="overlay"
                />
              ) : null}
            </Animated.View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ProgressSegment({
  state,
  durationMs,
  isPaused,
}: {
  state: "filled" | "active" | "empty";
  durationMs: number;
  isPaused?: boolean;
}) {
  const progress = useSharedValue(state === "filled" ? 1 : 0);

  useEffect(() => {
    if (isPaused) return;
    if (state === "filled") {
      progress.value = 1;
    } else if (state === "empty") {
      progress.value = 0;
    } else {
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: durationMs,
        easing: Easing.linear,
      });
    }
  }, [state, durationMs, progress, isPaused]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={{
        flex: 1,
        height: 2,
        borderRadius: 1,
        backgroundColor: "rgba(255,255,255,0.3)",
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            borderRadius: 1,
            backgroundColor: "#FFFFFF",
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
