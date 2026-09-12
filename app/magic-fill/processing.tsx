import { useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { assembleMagicFillDrafts } from "@/lib/magicFill";
import { flushMagicFillVoiceTranscriptions } from "@/lib/magicFillVoiceQueue";
import { useMagicFillStore } from "@/store/magicFillStore";
import { MagicFillMomentCollage } from "@/components/magic-fill/MagicFillMomentCollage";
import { useTheme } from "@/hooks/useTheme";

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
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
      <MagicFillMomentCollage
        drafts={activeDrafts}
        borderColor={colors.text}
        backgroundColor={colors.surfaceSecondary}
      />

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
