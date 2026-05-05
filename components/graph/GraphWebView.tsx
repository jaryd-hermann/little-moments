import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import type { GraphNode, GraphEdge } from "@/hooks/useGraph";
import { graphWebContent, type HullMode } from "./graphWebContent";

/**
 * D3 source is ~273KB. Load from the bundled asset once per session —
 * subsequent GraphWebView mounts reuse the cached string.
 */
let d3SourcePromise: Promise<string> | null = null;

function loadD3Source(): Promise<string> {
  if (!d3SourcePromise) {
    d3SourcePromise = (async () => {
      const [asset] = await Asset.loadAsync(
        require("@/assets/d3-v7-min.txt")
      );
      if (!asset?.localUri) {
        throw new Error("D3 asset failed to load (no localUri)");
      }
      return FileSystem.readAsStringAsync(asset.localUri);
    })();
  }
  return d3SourcePromise;
}

export interface GraphFilter {
  themes: string[];
  people: string[];
  places: string[];
  timeRange: "all" | "year" | "3months";
}

export const EMPTY_FILTER: GraphFilter = {
  themes: [],
  people: [],
  places: [],
  timeRange: "all",
};

export interface GraphWebViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  filter: GraphFilter;
  hullMode: HullMode;
  showIntro: boolean;
  onIntroDismiss: () => void;
  onNodeTap: (entryId: string) => void;
  onEdgeTap: (threadId: string) => void;
}

type WebMessage =
  | { type: "nodeTap"; id: string }
  | { type: "edgeTap"; id: string }
  | { type: "dismissIntro" }
  | { type: "ready" }
  | { type: "settled"; positions: Record<string, { x: number; y: number }> }
  | { type: "snapshot"; dataUrl: string | null }
  | { type: "reviewDone" };

function layoutStorageKey(userId: string): string {
  return `graph-layout:${userId}`;
}

export interface GraphWebViewHandle {
  /** Renders graph to PNG, then opens native share sheet. */
  shareSnapshot: () => Promise<void>;
  /** Runs the year-in-review animation in the WebView. */
  playYearInReview: () => void;
  /** Zoom by a factor (e.g. 1.3 to zoom in, 0.77 to zoom out). Used by
   *  dev-mode buttons when running in the simulator, where pinch
   *  gestures aren't straightforward. */
  zoomBy: (factor: number) => void;
}

export const GraphWebView = forwardRef<GraphWebViewHandle, GraphWebViewProps>(
  function GraphWebView(
    {
      nodes,
      edges,
      filter,
      hullMode,
      showIntro,
      onIntroDismiss,
      onNodeTap,
      onEdgeTap,
    },
    ref
  ) {
  const { theme, colors } = useTheme();
  /** Light graph canvas — warm paper tone (matches product spec); dark uses app black. */
  const graphSurfaceBg = theme === "light" ? "#E8DDD0" : colors.background;
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [d3Source, setD3Source] = useState<string | null>(null);
  const [cachedPositions, setCachedPositions] = useState<
    Record<string, { x: number; y: number }> | null
  >(null);
  const [positionsHydrated, setPositionsHydrated] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const pendingSnapshotRef = useRef<{
    resolve: (val: void) => void;
    reject: (err: Error) => void;
  } | null>(null);

  // Load D3 + cached layout in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    loadD3Source()
      .then((src) => {
        if (!cancelled) setD3Source(src);
      })
      .catch((e) => {
        console.error("D3 load failed:", e);
      });

    if (userId) {
      AsyncStorage.getItem(layoutStorageKey(userId))
        .then((raw) => {
          if (cancelled) return;
          if (raw) {
            try {
              setCachedPositions(JSON.parse(raw));
            } catch {
              // ignore — stale cache
            }
          }
          setPositionsHydrated(true);
        })
        .catch(() => {
          if (!cancelled) setPositionsHydrated(true);
        });
    } else {
      setPositionsHydrated(true);
    }

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // HTML depends on initial-only props (nodes, edges, theme, initial hull mode,
  // initial intro state, cachedPositions). Filter is applied dynamically via
  // injectJavaScript so a filter change doesn't re-run the simulation.
  const html = useMemo(() => {
    if (!d3Source || !positionsHydrated) return null;
    return graphWebContent({
      nodes,
      edges,
      theme,
      showIntro,
      d3Source,
      cachedPositions: cachedPositions ?? undefined,
      hullMode,
    });
    // hullMode is intentionally in deps — changing it renders fresh HTML if
    // the WebView hasn't become ready yet. After ready, live changes go
    // through injectJavaScript (see effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d3Source, nodes, edges, theme, positionsHydrated]);

  const injectJS = useCallback((js: string) => {
    if (!isReadyRef.current) return;
    webViewRef.current?.injectJavaScript(js + "\ntrue;");
  }, []);

  // Apply filter live whenever it changes, without rebuilding HTML.
  useEffect(() => {
    injectJS(
      `if (window.__applyFilter) window.__applyFilter(${JSON.stringify(filter)});`
    );
  }, [filter, injectJS]);

  useEffect(() => {
    injectJS(
      `if (window.__setHullMode) window.__setHullMode(${JSON.stringify(hullMode)});`
    );
  }, [hullMode, injectJS]);

  const handleSnapshotMessage = useCallback(
    async (dataUrl: string | null) => {
      const pending = pendingSnapshotRef.current;
      pendingSnapshotRef.current = null;

      if (!dataUrl) {
        pending?.reject(new Error("Snapshot failed"));
        return;
      }
      try {
        const base64 = dataUrl.split(",")[1];
        const path =
          FileSystem.cacheDirectory + `memory-map-${Date.now()}.png`;
        await FileSystem.writeAsStringAsync(path, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, {
            mimeType: "image/png",
            dialogTitle: "My memory map",
          });
        }
        pending?.resolve();
      } catch (e) {
        pending?.reject(e as Error);
      }
    },
    []
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: WebMessage | null = null;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!msg) return;

      switch (msg.type) {
        case "nodeTap":
          onNodeTap(msg.id);
          break;
        case "edgeTap":
          onEdgeTap(msg.id);
          break;
        case "dismissIntro":
          onIntroDismiss();
          break;
        case "ready":
          isReadyRef.current = true;
          // Replay filter + hull mode once the webview is ready — the
          // initial HTML used defaults; the current props may differ if
          // the user flipped state before ready.
          injectJS(
            `if (window.__applyFilter) window.__applyFilter(${JSON.stringify(filter)});
             if (window.__setHullMode) window.__setHullMode(${JSON.stringify(hullMode)});`
          );
          break;
        case "settled":
          if (userId && msg.positions) {
            AsyncStorage.setItem(
              layoutStorageKey(userId),
              JSON.stringify(msg.positions)
            ).catch(() => {
              // Best-effort cache — a storage failure shouldn't break rendering.
            });
          }
          break;
        case "snapshot":
          void handleSnapshotMessage(msg.dataUrl);
          break;
        case "reviewDone":
          break;
      }
    },
    [
      onNodeTap,
      onEdgeTap,
      onIntroDismiss,
      userId,
      injectJS,
      filter,
      hullMode,
      handleSnapshotMessage,
    ]
  );

  useImperativeHandle(
    ref,
    () => ({
      shareSnapshot: () =>
        new Promise<void>((resolve, reject) => {
          if (!isReadyRef.current) {
            reject(new Error("Graph not ready yet"));
            return;
          }
          // If a snapshot is already in flight, reject the previous one.
          pendingSnapshotRef.current?.reject(
            new Error("Superseded by newer snapshot request")
          );
          pendingSnapshotRef.current = { resolve, reject };
          injectJS("if (window.__exportSnapshot) window.__exportSnapshot();");
        }),
      playYearInReview: () => {
        injectJS(
          "if (window.__playYearInReview) window.__playYearInReview();"
        );
      },
      zoomBy: (factor: number) => {
        injectJS(
          `if (window.__zoomBy) window.__zoomBy(${Number(factor) || 1});`
        );
      },
    }),
    [injectJS]
  );

  if (!html) {
    return (
      <View style={[styles.loading, { backgroundColor: graphSurfaceBg }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: graphSurfaceBg }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        style={{ backgroundColor: graphSurfaceBg }}
        allowsBackForwardNavigationGestures={false}
      />
    </View>
  );
  }
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
