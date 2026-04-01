import { View, Dimensions } from "react-native";
import { Image } from "expo-image";
import type { ChapterImageSlide as ImageSlideData } from "@/lib/chapters";
import { chapterImageSlideToMedia } from "@/lib/chapters";
import { getEntryMediaDisplayUri } from "@/lib/entryMediaUrl";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const GAP = 4;

function resolveUri(path: string, media: ReturnType<typeof chapterImageSlideToMedia>[number]): string {
  if (/^https?:\/\//i.test(path)) return path;
  return getEntryMediaDisplayUri(media);
}

interface ChapterImageSlideProps {
  imageSlide: ImageSlideData;
  availableHeight?: number;
}

export function ChapterImageSlide({
  imageSlide,
  availableHeight = SCREEN_H * 0.65,
}: ChapterImageSlideProps) {
  const media = chapterImageSlideToMedia(imageSlide);
  const uris = media
    .map((m, i) => resolveUri(imageSlide.storage_paths[i] ?? "", m))
    .filter(Boolean);

  if (uris.length === 0) return null;

  const containerW = SCREEN_W - 32;

  switch (imageSlide.layout) {
    case "v1":
      return (
        <View style={{ width: containerW, height: availableHeight, alignSelf: "center" }}>
          <Image
            source={{ uri: uris[0] }}
            style={{ flex: 1, borderRadius: 12 }}
            contentFit="cover"
          />
        </View>
      );

    case "v2":
      return (
        <View style={{ width: containerW, height: availableHeight, alignSelf: "center", gap: GAP }}>
          <Image
            source={{ uri: uris[0] }}
            style={{ flex: 1, borderRadius: 12 }}
            contentFit="cover"
          />
          <Image
            source={{ uri: uris[1] }}
            style={{ flex: 1, borderRadius: 12 }}
            contentFit="cover"
          />
        </View>
      );

    case "v3": {
      const half = (availableHeight - GAP) / 2;
      return (
        <View
          style={{
            width: containerW,
            height: availableHeight,
            alignSelf: "center",
            flexDirection: "row",
            gap: GAP,
          }}
        >
          <Image
            source={{ uri: uris[0] }}
            style={{ flex: 1, borderRadius: 12 }}
            contentFit="cover"
          />
          <View style={{ flex: 1, gap: GAP }}>
            <Image
              source={{ uri: uris[1] }}
              style={{ height: half, borderRadius: 12 }}
              contentFit="cover"
            />
            <Image
              source={{ uri: uris[2] }}
              style={{ height: half, borderRadius: 12 }}
              contentFit="cover"
            />
          </View>
        </View>
      );
    }

    case "v4": {
      const cellH = (availableHeight - GAP) / 2;
      return (
        <View style={{ width: containerW, height: availableHeight, alignSelf: "center", gap: GAP }}>
          <View style={{ flexDirection: "row", gap: GAP, height: cellH }}>
            <Image source={{ uri: uris[0] }} style={{ flex: 1, borderRadius: 12 }} contentFit="cover" />
            <Image source={{ uri: uris[1] }} style={{ flex: 1, borderRadius: 12 }} contentFit="cover" />
          </View>
          <View style={{ flexDirection: "row", gap: GAP, height: cellH }}>
            <Image source={{ uri: uris[2] }} style={{ flex: 1, borderRadius: 12 }} contentFit="cover" />
            <Image source={{ uri: uris[3] }} style={{ flex: 1, borderRadius: 12 }} contentFit="cover" />
          </View>
        </View>
      );
    }

    case "v5":
    default: {
      const colW = (containerW - GAP) / 2;
      const leftUris = uris.filter((_, i) => i % 2 === 0);
      const rightUris = uris.filter((_, i) => i % 2 === 1);
      const imgH = colW * 1.2;

      return (
        <View
          style={{
            width: containerW,
            alignSelf: "center",
            flexDirection: "row",
            gap: GAP,
          }}
        >
          <View style={{ width: colW, gap: GAP }}>
            {leftUris.map((uri, i) => (
              <Image
                key={`l-${i}`}
                source={{ uri }}
                style={{ width: colW, height: imgH, borderRadius: 12 }}
                contentFit="cover"
              />
            ))}
          </View>
          <View style={{ width: colW, gap: GAP }}>
            {rightUris.map((uri, i) => (
              <Image
                key={`r-${i}`}
                source={{ uri }}
                style={{ width: colW, height: imgH, borderRadius: 12 }}
                contentFit="cover"
              />
            ))}
          </View>
        </View>
      );
    }
  }
}
