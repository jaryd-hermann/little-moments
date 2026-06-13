import { useEffect, useState } from "react";
import { Dimensions, Image, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { queryRecentCameraPhotos } from "@/hooks/useMediaLibrary";
import { useEntries } from "@/hooks/useEntries";
import { buildMomentDateSet, scanMagicFillGaps } from "@/lib/magicFill";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { useMagicFillStore } from "@/store/magicFillStore";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export default function MagicFillSearchingScreen() {
  const insets = useSafeAreaInsets();
  const { entries } = useEntries();
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const setDrafts = useMagicFillStore((s) => s.setDrafts);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const recent = await queryRecentCameraPhotos({ daysBack: 60, limit: 24 });
      if (cancelled) return;
      const uris = recent.map((p) => p.uri).filter(Boolean);
      setPhotoUris(uris.length > 0 ? uris : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (photoUris.length <= 1) return;
    const id = setInterval(() => {
      setSlideIndex((i) => (i + 1) % photoUris.length);
    }, 500);
    return () => clearInterval(id);
  }, [photoUris.length]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const momentDates = buildMomentDateSet(entries);
      const drafts = await scanMagicFillGaps({
        gapTarget,
        existingMomentDates: momentDates,
      });
      if (cancelled) return;
      setDrafts(drafts);
      const delay = Math.max(1500, photoUris.length * 500);
      setTimeout(() => {
        if (cancelled) return;
        if (drafts.filter((d) => !d.skipped).length === 0) {
          router.replace({ pathname: "/magic-fill", params: { empty: "1" } });
          return;
        }
        router.replace("/magic-fill/review");
      }, delay);
    })();
    return () => {
      cancelled = true;
    };
  }, [gapTarget, entries, photoUris.length, setDrafts]);

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
          Searching your gallery…
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
          Looking for days with photos but no moment yet
        </Text>
      </View>
    </View>
  );
}
