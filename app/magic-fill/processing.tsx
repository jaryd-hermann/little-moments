import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { assembleMagicFillDrafts } from "@/lib/magicFill";
import { flushMagicFillVoiceTranscriptions } from "@/lib/magicFillVoiceQueue";
import {
  selectedPhoto,
  useMagicFillStore,
  type MagicFillDraft,
} from "@/store/magicFillStore";
import { DayAssetPreview } from "@/components/capture/DayAssetPreview";
import { useTheme } from "@/hooks/useTheme";

const THUMB = 72;
const COLLAGE_W = 280;
const COLLAGE_H = 168;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Staggered positions for 1–6 thumbnails in the collage area. */
const COLLAGE_SLOTS: Array<{
  left: number;
  top: number;
  rotate: string;
  zIndex: number;
}> = [
  { left: 104, top: 48, rotate: "-4deg", zIndex: 3 },
  { left: 36, top: 28, rotate: "6deg", zIndex: 2 },
  { left: 168, top: 20, rotate: "-7deg", zIndex: 4 },
  { left: 64, top: 88, rotate: "5deg", zIndex: 1 },
  { left: 148, top: 82, rotate: "-5deg", zIndex: 5 },
  { left: 108, top: 8, rotate: "3deg", zIndex: 2 },
];

function MagicFillMomentCollage({ drafts }: { drafts: MagicFillDraft[] }) {
  const { colors } = useTheme();
  const thumbs = useMemo(
    () =>
      drafts
        .map((d) => selectedPhoto(d))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .slice(0, COLLAGE_SLOTS.length),
    [drafts]
  );

  if (thumbs.length === 0) return null;

  return (
    <View
      style={{
        width: COLLAGE_W,
        height: COLLAGE_H,
        alignSelf: "center",
        marginBottom: 32,
      }}
    >
      {thumbs.map((asset, i) => {
        const slot = COLLAGE_SLOTS[i] ?? COLLAGE_SLOTS[0];
        return (
          <View
            key={asset.id}
            style={{
              position: "absolute",
              left: slot.left,
              top: slot.top,
              width: THUMB,
              height: THUMB,
              borderRadius: 12,
              overflow: "hidden",
              borderWidth: 2,
              borderColor: colors.text,
              backgroundColor: colors.surfaceSecondary,
              transform: [{ rotate: slot.rotate }],
              zIndex: slot.zIndex,
            }}
          >
            <DayAssetPreview asset={asset} animate={false} />
          </View>
        );
      })}
    </View>
  );
}

export default function MagicFillProcessingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const drafts = useMagicFillStore((s) => s.drafts);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const setIsProcessing = useMagicFillStore((s) => s.setIsProcessing);

  const activeDrafts = useMemo(
    () => drafts.filter((d) => !d.skipped && d.rawCaption.trim()),
    [drafts]
  );

  const photoCount = activeDrafts.length;
  const wordCount = useMemo(
    () => activeDrafts.reduce((sum, d) => sum + countWords(d.rawCaption), 0),
    [activeDrafts]
  );

  const statsLine = useMemo(() => {
    const wordLabel = wordCount === 1 ? "word" : "words";
    const photoLabel = photoCount === 1 ? "photo" : "photos";
    if (wordCount > 0 && photoCount > 0) {
      return `Taking ${wordCount} ${wordLabel} across ${photoCount} ${photoLabel}, and making your moments`;
    }
    if (photoCount > 0) {
      return `Taking ${photoCount} ${photoLabel}, and making your moments`;
    }
    return "Making your moments";
  }, [photoCount, wordCount]);

  useEffect(() => {
    let cancelled = false;
    setIsProcessing(true);
    void (async () => {
      try {
        await flushMagicFillVoiceTranscriptions();
        const snapshot = useMagicFillStore.getState().drafts;
        const assembled = await assembleMagicFillDrafts(snapshot);
        if (cancelled) return;
        setDrafts(assembled);
        router.replace("/magic-fill/preview");
      } catch {
        if (!cancelled) router.replace("/magic-fill/preview");
      } finally {
        if (!cancelled) setIsProcessing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setDrafts, setIsProcessing]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top + 48,
        paddingHorizontal: 28,
        paddingBottom: Math.max(insets.bottom, 24),
      }}
    >
      <MagicFillMomentCollage drafts={activeDrafts} />

      <Text
        style={magicFillHeadlineStyle({
          fontSize: 32,
          lineHeight: 38,
          color: colors.text,
          textAlign: "center",
          marginBottom: 12,
        })}
      >
        Creating your moments
      </Text>

      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 22,
          color: colors.textSecondary,
          textAlign: "center",
        }}
      >
        {statsLine}
      </Text>
    </View>
  );
}
