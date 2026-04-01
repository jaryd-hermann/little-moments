import { useEffect, useState } from "react";
import {
  View,
  Image as RNImage,
  type StyleProp,
  type ViewStyle,
  type ImageStyle,
  StyleSheet,
} from "react-native";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import type { EntryMedia } from "@/store/entryStore";
import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
  getStorageImageHeadersSync,
  isSupabaseStorageObjectUrl,
} from "@/lib/entryMediaUrl";

interface EntryMediaImageProps {
  media: EntryMedia;
  style?: StyleProp<ViewStyle>;
  recyclingKey?: string;
}

type SourceShape = { uri: string; headers?: Record<string, string> };

function flattenImageStyle(style: StyleProp<ViewStyle>): ImageStyle {
  const f = StyleSheet.flatten(style) as ImageStyle;
  return f ?? {};
}

function sourceForUri(uri: string): SourceShape {
  if (uri.startsWith("file:")) {
    return { uri };
  }
  if (isSupabaseStorageObjectUrl(uri)) {
    return { uri };
  }
  return { uri, headers: getStorageImageHeadersSync() };
}

export function EntryMediaImage({
  media,
  style,
  recyclingKey,
}: EntryMediaImageProps) {
  const [displayUri, setDisplayUri] = useState<string | null>(null);
  const [useRnFallback, setUseRnFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUseRnFallback(false);

    void (async () => {
      const syncUri = getEntryMediaDisplayUri(media);
      if (!media.storage_path && !syncUri) {
        if (!cancelled) setDisplayUri(null);
        return;
      }

      try {
        const remote = await resolveEntryMediaUriAsync(media);
        if (cancelled) return;
        if (!remote) {
          setDisplayUri(syncUri || null);
          return;
        }

        if (FileSystem.cacheDirectory && remote.startsWith("http")) {
          const ext = media.media_type === "video" ? "mp4" : "jpg";
          const path = `${FileSystem.cacheDirectory}lm-em-${media.id}.${ext}`;
          const dl = await FileSystem.downloadAsync(remote, path);
          if (cancelled) return;
          if (dl.status === 200) {
            if (__DEV__) {
              console.log("[EntryMediaImage] cached to file", media.id);
            }
            setDisplayUri(dl.uri);
            return;
          }
        }

        setDisplayUri(remote);
      } catch (e) {
        if (__DEV__) {
          console.warn("[EntryMediaImage] load failed, using sync URI", media.id, e);
        }
        if (!cancelled) setDisplayUri(syncUri || null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [media]);

  if (!displayUri) {
    return (
      <View
        style={[
          style,
          { backgroundColor: "rgba(128,128,128,0.2)" },
        ]}
      />
    );
  }

  const src = sourceForUri(displayUri);
  const plainUriOnly = !src.headers;
  const expoSource = plainUriOnly ? { uri: displayUri } : { uri: displayUri, headers: src.headers! };
  const rnSource = expoSource;
  const flatStyle = flattenImageStyle(style);

  if (useRnFallback) {
    return (
      <RNImage
        source={rnSource}
        style={flatStyle}
        resizeMode="cover"
        onError={(e) => {
          if (__DEV__) {
            console.warn(
              "[EntryMediaImage] RN Image failed",
              media.id,
              e.nativeEvent.error
            );
          }
        }}
      />
    );
  }

  return (
    <Image
      source={expoSource}
      style={flatStyle}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? media.id}
      onError={(e) => {
        if (__DEV__) {
          console.warn(
            "[EntryMediaImage] expo-image failed, trying RN Image",
            media.id,
            e.error
          );
        }
        setUseRnFallback(true);
      }}
    />
  );
}
