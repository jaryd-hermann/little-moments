import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useThreads } from "@/hooks/useThreads";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { useGraph } from "@/hooks/useGraph";
import { useEntries } from "@/hooks/useEntries";
import { useSettingsStore } from "@/store/settingsStore";
import { ThreadFlipbookView } from "@/components/threads/ThreadFlipbookView";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import {
  GraphWebView,
  EMPTY_FILTER,
  type GraphFilter,
  type GraphWebViewHandle,
} from "@/components/graph/GraphWebView";
import { GraphFilterSheet } from "@/components/graph/GraphFilterSheet";
import type { HullMode } from "@/components/graph/graphWebContent";
import {
  makeDummyThread,
  THREAD_DEV_PREVIEW_ID,
  useThreadDevStore,
} from "@/store/threadDevStore";
import { threadOrdinalByIdMap } from "@/lib/threadOrdinal";

function GraphTab() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries } = useEntries();
  const momentsCount = useMemo(
    () => entries.filter((e) => e.entry_type === "moment").length,
    [entries]
  );
  const {
    visibleNodes,
    visibleEdges,
    people,
    places,
    isGated,
    hiddenNodeCount,
    isLoading,
  } = useGraph();
  const graphIntroSeen = useSettingsStore((s) => s.graphIntroSeen);
  const setGraphIntroSeen = useSettingsStore((s) => s.setGraphIntroSeen);

  const [filter, setFilter] = useState<GraphFilter>(EMPTY_FILTER);
  const [hullMode, setHullMode] = useState<HullMode>("theme");
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const graphRef = useRef<GraphWebViewHandle>(null);

  const activeFilterCount =
    (filter.themes.length > 0 ? 1 : 0) +
    (filter.people.length > 0 ? 1 : 0) +
    (filter.places.length > 0 ? 1 : 0) +
    (filter.timeRange !== "all" ? 1 : 0);

  // Dev-only zoom buttons — gated on __DEV__ so they never ship to prod.
  // Always-on in development (simulator pinch is fiddly); if you install
  // a dev build on a physical device they'll show there too.
  const showDevZoomControls = __DEV__;
  const handleZoomIn = useCallback(() => {
    graphRef.current?.zoomBy(1.3);
  }, []);
  const handleZoomOut = useCallback(() => {
    graphRef.current?.zoomBy(0.77);
  }, []);

  // When the user selects a person chip, the "aha" moment is seeing that
  // person's cluster pop. Auto-switch hull mode to match — overriding the
  // default theme grouping — unless they've explicitly chosen something.
  const handleFilterChange = useCallback(
    (next: GraphFilter) => {
      setFilter(next);
      if (next.people.length > 0 && hullMode !== "person") {
        setHullMode("person");
      }
    },
    [hullMode]
  );

  const handleNodeTap = useCallback((entryId: string) => {
    router.push(`/entry/${entryId}`);
  }, []);
  const handleEdgeTap = useCallback((threadId: string) => {
    router.push(`/threads/${threadId}`);
  }, []);
  const handleIntroDismiss = useCallback(() => {
    setGraphIntroSeen(true);
  }, [setGraphIntroSeen]);

  if (isLoading && visibleNodes.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (momentsCount < 5) {
    return <BrainGraphPlaceholder />;
  }

  return (
    <View style={{ flex: 1 }}>
      <GraphWebView
        ref={graphRef}
        nodes={visibleNodes}
        edges={visibleEdges}
        filter={filter}
        hullMode={hullMode}
        showIntro={!graphIntroSeen && visibleNodes.length > 0}
        onIntroDismiss={handleIntroDismiss}
        onNodeTap={handleNodeTap}
        onEdgeTap={handleEdgeTap}
      />

      {visibleNodes.length > 0 ? (
        <>
          {showDevZoomControls ? (
            <View
              style={{
                position: "absolute",
                right: 20,
                top: 16,
                flexDirection: "column",
                gap: 8,
              }}
              pointerEvents="box-none"
            >
              <Pressable
                onPress={handleZoomIn}
                accessibilityLabel="Zoom in (dev)"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="add" size={20} color={colors.text} />
              </Pressable>
              <Pressable
                onPress={handleZoomOut}
                accessibilityLabel="Zoom out (dev)"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="remove" size={20} color={colors.text} />
              </Pressable>
            </View>
          ) : null}

          <Pressable
            onPress={() => setFilterSheetVisible(true)}
            accessibilityLabel="Open filters"
            style={{
              position: "absolute",
              right: 20,
              bottom: isGated ? 130 : 100,
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: "#000000",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Ionicons name="options" size={22} color="#1A1A1A" />
            {activeFilterCount > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#1A1A1A",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Bold",
                    fontSize: 10,
                    color: "#FFFFFF",
                  }}
                >
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </>
      ) : null}

      <GraphFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        nodes={visibleNodes}
        people={people}
        places={places}
        filter={filter}
        hullMode={hullMode}
        onFilterChange={handleFilterChange}
        onHullModeChange={setHullMode}
      />

      {isGated ? (
        <Pressable
          onPress={() => launchPremiumFlow(posthog, "brain_graph_gated")}
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 24,
            paddingVertical: 14,
            paddingHorizontal: 18,
            borderRadius: 16,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: "#1A1A1A",
              }}
            >
              See your full map
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 12,
                color: "#1A1A1A",
                opacity: 0.7,
                marginTop: 2,
              }}
            >
              {hiddenNodeCount} more moments hidden. Upgrade to Premium.
            </Text>
          </View>
          <Ionicons name="lock-closed" size={18} color="#1A1A1A" />
        </Pressable>
      ) : null}
    </View>
  );
}

function BrainGraphPlaceholder() {
  const { colors, theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 100,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 24,
          borderWidth: 1.5,
          borderStyle: "dashed",
          borderColor: colors.border,
          padding: 28,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 220,
            height: 130,
            marginBottom: 28,
          }}
        >
          {/* Five dots forming a small graph (positions tuned for the 220x130 box). */}
          {[
            { left: 20, top: 32, size: 28 },
            { left: 88, top: 0, size: 22 },
            { left: 130, top: 38, size: 24 },
            { left: 70, top: 70, size: 18 },
            { left: 170, top: 78, size: 16 },
          ].map((d, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                left: d.left,
                top: d.top,
                width: d.size,
                height: d.size,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 1,
                borderColor: colors.text,
              }}
            />
          ))}
        </View>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            lineHeight: 26,
            color: colors.text,
            textAlign: "center",
            marginBottom: 10,
          }}
        >
          Your moments will start{"\n"}connecting here
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 24,
            paddingHorizontal: 8,
          }}
        >
          Capture 5 moments to see your brain graph start to develop.
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/today")}
          style={{
            height: 56,
            paddingHorizontal: 28,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            ...bevelShadow(theme),
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: PINK_CTA_INK,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Capture a moment
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ThreadsScreen() {
  const { colors, theme } = useTheme();
  const {
    visibleThreads,
    isLoading,
    isThreadLocked,
  } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

  const listThreads = useMemo(() => {
    if (__DEV__ && dummyThreadEnabled) {
      return [makeDummyThread(), ...visibleThreads];
    }
    return visibleThreads;
  }, [dummyThreadEnabled, visibleThreads]);

  const threadOrdinals = useMemo(
    () => threadOrdinalByIdMap(listThreads),
    [listThreads]
  );

  // Stable predicate handed to the flipbook. The dummy preview thread
  // (DEV-only) is always unlocked so we can demo the layout.
  const isLockedForFlipbook = useCallback(
    (thread: typeof listThreads[number], index: number) => {
      if (thread.id === THREAD_DEV_PREVIEW_ID) return false;
      return isThreadLocked(thread, index);
    },
    [isThreadLocked]
  );

  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  // Connect tab defaults to the Threads (flipbook) view — that's the
  // primary surface; Graph is opt-in via the toggle or ?tab=graph.
  const [activeTab, setActiveTab] = useState<"ellie" | "graph">(
    tabParam === "graph" ? "graph" : "ellie"
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header — title left, view toggle right */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: colors.text,
          }}
        >
          Connections
        </Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: colors.surfaceSecondary,
            borderRadius: 9999,
            padding: 3,
          }}
        >
          {(["ellie", "graph"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: 9999,
                backgroundColor:
                  activeTab === tab ? colors.primary : "transparent",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 12,
                  color: activeTab === tab ? "#1A1A1A" : colors.textMuted,
                  letterSpacing: 0.3,
                }}
              >
                {tab === "ellie" ? "Threads" : "Graph"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {activeTab === "graph" ? (
        <GraphTab />
      ) : listThreads.length === 0 ? (
        !isLoading ? (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 40,
              paddingTop: 8,
            }}
          >
            <EllieMessage
              content="Keep capturing moments. When I find you unexpected patterns, themes, or insights across your moments I'll let you know here"
              showAvatar
            />
            <Pressable
              onPress={() => router.push("/(tabs)/today")}
              style={{
                marginTop: 20,
                height: 56,
                paddingHorizontal: 28,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                borderWidth: 2,
                borderColor: PINK_CTA_BORDER,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                ...bevelShadow(theme),
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: PINK_CTA_INK,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                Capture a moment
              </Text>
            </Pressable>
          </ScrollView>
        ) : null
      ) : (
        // CustomTabBar overlays the bottom of the screen, so reserve the
        // same gutter the capsule flipbook uses (memories.tsx) to keep the
        // card from being cropped behind the diamond/triangle row.
        <View style={{ flex: 1, paddingBottom: 100 }}>
          <ThreadFlipbookView
            threads={listThreads}
            ordinals={threadOrdinals}
            isLocked={isLockedForFlipbook}
          />
        </View>
      )}

    </SafeAreaView>
  );
}
