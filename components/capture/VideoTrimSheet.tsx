import { VideoTrimPreview } from "@/components/capture/VideoTrimPreview";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import * as MediaLibrary from "expo-media-library";
import {
  isPlayableMediaUri,
  resolveMediaAssetUri,
  resolveVideoPosterForAsset,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { peekVideoPosterUri } from "@/lib/videoPoster";
import { useTheme } from "@/hooks/useTheme";
import { MOMENT_VIDEO_CLIP_SEC } from "@/lib/videoClip";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface VideoTrimResult {
  asset: MediaAsset;
  resolvedUri: string;
  clipStartSec: number;
}

export interface VideoTrimSheetProps {
  visible: boolean;
  asset: MediaAsset | null;
  onClose: () => void;
  onConfirm: (result: VideoTrimResult) => void;
}

export function VideoTrimSheet({
  visible,
  asset,
  onClose,
  onConfirm,
}: VideoTrimSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const previewSize = screenWidth - 48;

  const [loading, setLoading] = useState(true);
  const [resolvedAsset, setResolvedAsset] = useState<MediaAsset | null>(null);
  const [durationSec, setDurationSec] = useState(10);
  const [clipStartSec, setClipStartSec] = useState(0);
  const [posterUri, setPosterUri] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !asset) {
      setResolvedAsset(null);
      setLoading(true);
      setClipStartSec(0);
      setPosterUri(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const cachedPoster = peekVideoPosterUri(asset.id, 0);
    // Show the poster immediately — it's usually already cached from the
    // carousel, so the sheet has content while the (serialized) full-file
    // resolve runs behind other Photos work.
    setPosterUri(cachedPoster);
    void resolveVideoPosterForAsset(asset, 0).then((uri) => {
      if (!cancelled && uri) setPosterUri(uri);
    });
    void (async () => {
      try {
        const resolved = await resolveMediaAssetUri(asset);
        if (cancelled) return;
        setResolvedAsset(resolved);
        let dur = 60;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(asset.id);
          if (typeof info.duration === "number" && info.duration > 0) {
            dur = info.duration;
          }
        } catch {
          /* default duration */
        }
        setDurationSec(Math.max(MOMENT_VIDEO_CLIP_SEC, dur));
        setClipStartSec(0);
      } catch {
        /* keep poster + spinner; resolve will retry on next open */
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, asset]);

  const maxStart = Math.max(0, durationSec - MOMENT_VIDEO_CLIP_SEC);

  const scrubPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          void Haptics.selectionAsync();
        },
        onPanResponderMove: (_, g) => {
          const trackWidth = screenWidth - 48;
          const ratio = Math.max(0, Math.min(1, g.moveX / trackWidth));
          setClipStartSec(ratio * maxStart);
        },
      }),
    [maxStart, screenWidth]
  );

  const handleConfirm = useCallback(() => {
    if (!asset || !resolvedAsset) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm({
      asset,
      resolvedUri: resolvedAsset.uri,
      clipStartSec,
    });
  }, [asset, clipStartSec, onConfirm, resolvedAsset]);

  if (!asset) return null;

  const playable = Boolean(resolvedAsset && isPlayableMediaUri(resolvedAsset.uri));
  const windowLeftPct = maxStart > 0 ? (clipStartSec / durationSec) * 100 : 0;
  const windowWidthPct = (MOMENT_VIDEO_CLIP_SEC / durationSec) * 100;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 20,
            paddingHorizontal: 24,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <Text
            style={magicFillHeadlineStyle({
              fontSize: 26,
              lineHeight: 32,
              color: colors.text,
              marginBottom: 6,
            })}
          >
            Pick your 2 seconds
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 20,
              color: colors.textSecondary,
              marginBottom: 16,
            }}
          >
            Drag to choose the best moment from this video.
          </Text>

          <View
            style={{
              width: previewSize,
              height: previewSize,
              alignSelf: "center",
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: colors.text,
              backgroundColor: colors.surfaceSecondary,
              marginBottom: 20,
            }}
          >
            <VideoTrimPreview
              assetId={asset.id}
              videoUri={playable ? resolvedAsset!.uri : null}
              clipStartSec={clipStartSec}
              preparing={loading || !playable}
              posterUriOverride={posterUri}
            />
          </View>

          {!playable && !loading ? (
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 13,
                lineHeight: 18,
                color: colors.textSecondary,
                textAlign: "center",
                marginTop: -12,
                marginBottom: 16,
              }}
            >
              Preview unavailable — open this video in Photos to download it from
              iCloud, then try again.
            </Text>
          ) : null}

          <View style={{ marginBottom: 20 }}>
            <View
              {...scrubPan.panHandlers}
              style={{
                height: 44,
                borderRadius: 10,
                backgroundColor: colors.surfaceSecondary,
                borderWidth: 1.5,
                borderColor: colors.border,
                overflow: "hidden",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: `${windowLeftPct}%`,
                  width: `${Math.min(100 - windowLeftPct, windowWidthPct)}%`,
                  top: 6,
                  bottom: 6,
                  borderRadius: 8,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: colors.text,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 12,
                color: colors.textMuted,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              {MOMENT_VIDEO_CLIP_SEC}s clip · starts at {clipStartSec.toFixed(1)}s
            </Text>
          </View>

          <MagicFillPrimaryButton
            label="Continue with this clip"
            variant="pink"
            onPress={handleConfirm}
            disabled={loading || !playable}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
