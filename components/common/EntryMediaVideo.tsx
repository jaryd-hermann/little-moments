import { useEffect, useState } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { WebView } from "react-native-webview";
import type { EntryMedia } from "@/store/entryStore";
import {
  getEntryMediaDisplayUri,
  resolveEntryMediaUriAsync,
} from "@/lib/entryMediaUrl";

interface EntryMediaVideoProps {
  media: EntryMedia;
  style?: StyleProp<ViewStyle>;
}

/** Embed URL in HTML safely (attribute context). */
function videoHtml(uri: string): string {
  const safeSrc = JSON.stringify(uri);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">
<style>
  html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden;}
  video{width:100%;height:100%;object-fit:cover;background:#000;}
</style>
</head>
<body>
<video src=${safeSrc} controls playsinline webkit-playsinline preload="metadata"></video>
</body>
</html>`;
}

export function EntryMediaVideo({ media, style }: EntryMediaVideoProps) {
  const [uri, setUri] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    setUri(null);

    void (async () => {
      try {
        const resolved = await resolveEntryMediaUriAsync(media);
        const url = (resolved || getEntryMediaDisplayUri(media)).trim();
        if (cancelled) return;
        if (!url) {
          setLoadFailed(true);
          return;
        }
        setUri(url);
      } catch {
        if (cancelled) return;
        const fallback = getEntryMediaDisplayUri(media).trim();
        if (fallback) setUri(fallback);
        else setLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [media.id, media.storage_path, media.storage_url]); // eslint-disable-line react-hooks/exhaustive-deps -- storage identity only

  const flat = StyleSheet.flatten(style) as ViewStyle;
  const placeholderBg =
    (flat.backgroundColor as string | undefined) ?? "rgba(128,128,128,0.2)";

  if (loadFailed || !uri) {
    return (
      <View
        style={[
          style,
          {
            backgroundColor: placeholderBg,
            overflow: "hidden",
          },
        ]}
      />
    );
  }

  return (
    <View style={[style, { overflow: "hidden" }]}>
      <WebView
        source={{ html: videoHtml(uri), baseUrl: "https://localhost" }}
        style={StyleSheet.absoluteFill}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        mediaPlaybackRequiresUserAction={false}
        androidLayerType="hardware"
        originWhitelist={["*"]}
        onError={() => setLoadFailed(true)}
      />
    </View>
  );
}
