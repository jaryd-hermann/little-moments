import { useEffect, useRef, useState } from "react";
import { Dimensions, Image, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  queryAllCameraPhotosForMonth,
  queryRecentCameraPhotos,
} from "@/hooks/useMediaLibrary";
import { useEntryStore } from "@/store/entryStore";
import {
  buildMomentDateSet,
  scanMagicFillGaps,
  scanMagicFillGapsForMonth,
} from "@/lib/magicFill";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  useMagicFillStore,
  type MagicFillDraft,
} from "@/store/magicFillStore";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MONTAGE_MIN_MS = 1200;
const MONTAGE_SLIDE_MS = 450;
/**
 * The montage is decorative background only — it cycles a few images while the
 * real gap scan runs. Loading the whole month/quarter here made Magic Fill
 * take minutes on older, photo-heavy months.
 */
const MONTAGE_MAX_PHOTOS = 15;

export default function MagicFillSearchingScreen() {
  const insets = useSafeAreaInsets();
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const fillMode = useMagicFillStore((s) => s.fillMode);
  const targetMonthKey = useMagicFillStore((s) => s.targetMonthKey);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const montageStartedAt = useRef(Date.now());

  useEffect(() => {
    montageStartedAt.current = Date.now();
    let cancelled = false;
    void (async () => {
      let recent;
      if (fillMode === "month" && targetMonthKey) {
        recent = await queryAllCameraPhotosForMonth(targetMonthKey, {
          lightweight: true,
          limit: MONTAGE_MAX_PHOTOS,
        });
      } else {
        recent = await queryRecentCameraPhotos({
          daysBack: 120,
          limit: MONTAGE_MAX_PHOTOS,
          lightweight: true,
        });
      }
      if (cancelled) return;
      const uris = recent.map((p) => p.uri).filter(Boolean);
      setPhotoUris(uris.length > 0 ? uris : []);
      setSlideIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [fillMode, targetMonthKey]);

  useEffect(() => {
    if (photoUris.length <= 1) return;
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % photoUris.length);
    }, MONTAGE_SLIDE_MS);
    return () => clearInterval(id);
  }, [photoUris.length]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Read entries imperatively: a background refresh landing mid-scan would
      // otherwise change `entries` identity and restart the whole scan.
      const momentDates = buildMomentDateSet(
        useEntryStore.getState().entries
      );
      let drafts: MagicFillDraft[];
      try {
        drafts =
          fillMode === "month" && targetMonthKey
            ? await scanMagicFillGapsForMonth({
                monthKey: targetMonthKey,
                existingMomentDates: momentDates,
              })
            : await scanMagicFillGaps({
                gapTarget,
                existingMomentDates: momentDates,
              });
      } catch {
        // Never strand the user on the montage — send them back to the start.
        if (!cancelled) {
          router.replace({ pathname: "/magic-fill", params: { empty: "1" } });
        }
        return;
      }
      if (cancelled) return;
      setDrafts(drafts);

      const elapsed = Date.now() - montageStartedAt.current;
      const waitMs = Math.max(0, MONTAGE_MIN_MS - elapsed);
      setTimeout(() => {
        if (cancelled) return;
        if (drafts.filter((d) => !d.skipped).length === 0) {
          router.replace({ pathname: "/magic-fill", params: { empty: "1" } });
          return;
        }
        router.replace("/magic-fill/review");
      }, waitMs);
    })();
    return () => {
      cancelled = true;
    };
  }, [gapTarget, fillMode, targetMonthKey, setDrafts]);

  const bgUri = photoUris[slideIndex];

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      {bgUri ? (
        <Image
          source={{ uri: bgUri }}
          style={{
            position: "absolute",
            width: SCREEN_W,
            height: SCREEN_H,
          }}
          resizeMode="cover"
        />
      ) : null}
      <View
        style={{
          ...{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.62)",
          },
        }}
      />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 34,
            color: "#FFFFFF",
            textAlign: "center",
            marginBottom: 12,
          })}
        >
          {fillMode === "month" && targetMonthKey
            ? "Searching that month…"
            : "Searching your gallery…"}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: "rgba(255,255,255,0.82)",
            textAlign: "center",
          }}
        >
          Finding days with photos waiting to become moments.
        </Text>
      </View>
    </View>
  );
}
