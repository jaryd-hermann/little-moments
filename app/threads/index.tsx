import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  SafeAreaView,
  RefreshControl,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useThreads } from "@/hooks/useThreads";
import { useGraph } from "@/hooks/useGraph";
import { useSettingsStore } from "@/store/settingsStore";
import { ThreadCard } from "@/components/threads/ThreadCard";
import { ThreadInfoModal } from "@/components/threads/ThreadInfoModal";
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

const THREAD_MOCK_IMAGE = require("@/assets/images/thread-mock.png");

function ellieOpeningContent(count: number): string {
  if (count < 5) {
    return "I'm still getting to know you. I may make mistakes — these early connections are my best guesses. Keep logging, and I'll get better.";
  }
  if (count <= 20) {
    return "I'm starting to see patterns in your story. Here's what I've found so far.";
  }
  return "You've built something worth knowing. Here's what I see across your moments.";
}

function GraphTab() {
  const { colors } = useTheme();
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
              bottom: isGated ? 108 : 28,
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
          onPress={() => router.push("/paywall/upgrade")}
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

export default function ThreadsScreen() {
  const { colors } = useTheme();
  const {
    visibleThreads,
    totalConnections,
    isLoading,
    fetchAll,
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

  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [activeTab, setActiveTab] = useState<"ellie" | "graph">(
    tabParam === "graph" ? "graph" : "ellie"
  );
  const [infoVisible, setInfoVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: colors.text,
          }}
        >
          Threads
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={() => setInfoVisible(true)} hitSlop={12}>
            <Ionicons
              name="information-circle-outline"
              size={24}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Tab toggle */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 20,
          marginBottom: 16,
          gap: 0,
        }}
      >
        {(["ellie", "graph"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 20,
              borderRadius: 20,
              backgroundColor:
                activeTab === tab ? colors.primary : "transparent",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color:
                  activeTab === tab ? "#1A1A1A" : colors.textMuted,
              }}
            >
              {tab === "ellie" ? "Insights" : "Brain Graph"}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "graph" ? (
        <GraphTab />
      ) : (
        <FlatList
          data={listThreads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <EllieMessage
                content={ellieOpeningContent(totalConnections)}
                showAvatar
              />
            </View>
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ paddingTop: 8 }}>
                <EllieMessage
                  content="No threads yet. Keep logging moments and I'll find connections."
                  showAvatar
                />
                <Pressable
                  onPress={() => router.push("/(tabs)/add")}
                  style={{
                    marginTop: 20,
                    height: 52,
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: "#000000",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 15,
                      color: "#000000",
                    }}
                  >
                    Capture another moment
                  </Text>
                </Pressable>
                <Text
                  style={{
                    marginTop: 28,
                    fontFamily: "LibreBaskerville-Italic",
                    fontSize: 15,
                    lineHeight: 24,
                    color: colors.textSecondary,
                    textAlign: "center",
                  }}
                >
                  {"Keep an eye out for these,\nthis is what a new thread looks like"}
                </Text>
                <Image
                  source={THREAD_MOCK_IMAGE}
                  style={{
                    width: "100%",
                    marginTop: 14,
                    maxHeight: 280,
                    borderRadius: 16,
                  }}
                  resizeMode="contain"
                  accessibilityLabel="Preview of a new thread card"
                />
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const lockIndex =
              __DEV__ && dummyThreadEnabled ? index - 1 : index;
            const locked =
              item.id === THREAD_DEV_PREVIEW_ID
                ? false
                : isThreadLocked(
                    item,
                    lockIndex >= 0 ? lockIndex : 0
                  );
            return (
              <View style={{ marginBottom: 14 }}>
                <ThreadCard
                  thread={item}
                  locked={locked}
                  ordinalRank={threadOrdinals.get(item.id) ?? 1}
                />
              </View>
            );
          }}
        />
      )}

      <ThreadInfoModal
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
      />
    </SafeAreaView>
  );
}
