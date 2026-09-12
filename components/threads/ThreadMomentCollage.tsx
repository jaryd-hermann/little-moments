import { View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { threadCollageImageUrls } from "@/lib/threadDisplay";
import type { Thread } from "@/hooks/useThreads";

interface ThreadMomentCollageProps {
  thread: Thread;
  size?: number;
}

/**
 * Stacked thumbnails for the Connections feed — up to 2 images (one per entry).
 */
export function ThreadMomentCollage({
  thread,
  size = 72,
}: ThreadMomentCollageProps) {
  const urls = threadCollageImageUrls(thread);
  const offsets = [
    { left: 0, top: 0, zIndex: 2 },
    { left: 14, top: 18, zIndex: 1 },
  ];

  if (urls.length === 0) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          backgroundColor: "#E8E4DF",
        }}
      />
    );
  }

  return (
    <View style={{ width: size + 14, height: size + 18 }}>
      {urls.slice(0, 2).map((uri, i) => (
        <View
          key={uri}
          style={{
            position: "absolute",
            left: offsets[i]?.left ?? 0,
            top: offsets[i]?.top ?? 0,
            zIndex: offsets[i]?.zIndex ?? 1,
            width: size,
            height: size,
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: "#FFFFFF",
          }}
        >
          <ExpoImage
            source={{ uri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
      ))}
    </View>
  );
}
