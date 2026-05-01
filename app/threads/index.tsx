import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  Pressable,
  SafeAreaView,
  RefreshControl,
  ScrollView,
  Dimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "@/hooks/useTheme";
import { useEntries } from "@/hooks/useEntries";
import { useThreads, type Thread } from "@/hooks/useThreads";
import { ThreadCard } from "@/components/threads/ThreadCard";
import { ThreadInfoModal } from "@/components/threads/ThreadInfoModal";
import { EllieMessage } from "@/components/ellie/EllieMessage";
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

function ThreadsGraph({
  threads,
  entries,
  colors,
}: {
  threads: Thread[];
  entries: { id: string; title: string | null; body: string }[];
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  const screen = Dimensions.get("window");
  const W = screen.width - 16;
  const H = Math.max(420, screen.height - 240);

  const [selected, setSelected] = useState<{
    type: "thread";
    id: string;
  } | null>(null);

  const layout = useMemo(() => {
    // Collect every entry referenced by any thread, plus all entries (small nodes for unconnected ones).
    const entryIds = new Set<string>();
    threads.forEach((t) => {
      entryIds.add(t.entry_id_a);
      entryIds.add(t.entry_id_b);
    });
    entries.slice(0, 20).forEach((e) => entryIds.add(e.id));

    // Count thread-degree per entry (more threads → more central / larger).
    const degree = new Map<string, number>();
    threads.forEach((t) => {
      degree.set(t.entry_id_a, (degree.get(t.entry_id_a) ?? 0) + 1);
      degree.set(t.entry_id_b, (degree.get(t.entry_id_b) ?? 0) + 1);
    });

    const ids = Array.from(entryIds);
    // Sort by degree desc → high-degree nodes get inner ring positions
    ids.sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));

    const cx = W / 2;
    const cy = H / 2;
    const positions = new Map<string, { x: number; y: number; r: number }>();
    const N = ids.length;
    if (N === 0) {
      return { positions, ids };
    }
    if (N === 1) {
      positions.set(ids[0], { x: cx, y: cy, r: 18 });
      return { positions, ids };
    }
    // First 6 nodes inner ring, rest outer ring
    const innerCount = Math.min(6, N);
    const outerCount = N - innerCount;
    const innerR = Math.min(W, H) * 0.18;
    const outerR = Math.min(W, H) * 0.36;

    for (let i = 0; i < innerCount; i++) {
      const angle = (i / innerCount) * Math.PI * 2 - Math.PI / 2;
      positions.set(ids[i], {
        x: cx + innerR * Math.cos(angle),
        y: cy + innerR * Math.sin(angle),
        r: 14 + Math.min(8, (degree.get(ids[i]) ?? 0) * 2),
      });
    }
    for (let i = 0; i < outerCount; i++) {
      const angle = (i / Math.max(1, outerCount)) * Math.PI * 2 - Math.PI / 2;
      positions.set(ids[innerCount + i], {
        x: cx + outerR * Math.cos(angle),
        y: cy + outerR * Math.sin(angle),
        r: 9,
      });
    }
    return { positions, ids };
  }, [threads, entries, W, H]);

  const selectedThread = selected
    ? threads.find((t) => t.id === selected.id) ?? null
    : null;

  if (threads.length === 0) {
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
      >
        <EllieMessage
          showAvatar
          content={
            "Your moments will start connecting here.\n\n" +
            "After a few entries, I'll find the people, places, and themes that show up across them — and draw the lines."
          }
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ width: W, height: H, alignSelf: "center" }}>
        <Svg width={W} height={H}>
          {/* edges */}
          {threads.map((t) => {
            const a = layout.positions.get(t.entry_id_a);
            const b = layout.positions.get(t.entry_id_b);
            if (!a || !b) return null;
            const isSelected = selected?.id === t.id;
            return (
              <Line
                key={t.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isSelected ? colors.primary : colors.textMuted}
                strokeWidth={isSelected ? 2 : 1}
                opacity={isSelected ? 0.95 : 0.4}
              />
            );
          })}
          {/* nodes */}
          {layout.ids.map((id) => {
            const p = layout.positions.get(id);
            if (!p) return null;
            return (
              <Circle
                key={id}
                cx={p.x}
                cy={p.y}
                r={p.r}
                fill={colors.primaryLight}
                stroke={colors.text}
                strokeWidth={1.2}
              />
            );
          })}
        </Svg>

        {/* invisible touch targets for thread edge selection — center of each line */}
        {threads.map((t) => {
          const a = layout.positions.get(t.entry_id_a);
          const b = layout.positions.get(t.entry_id_b);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <Pressable
              key={`hit-${t.id}`}
              onPress={() =>
                setSelected((s) => (s?.id === t.id ? null : { type: "thread", id: t.id }))
              }
              style={{
                position: "absolute",
                left: mx - 18,
                top: my - 18,
                width: 36,
                height: 36,
                borderRadius: 18,
              }}
            />
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        {selectedThread ? (
          <View
            style={{
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: 14,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 11,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: colors.textMuted,
                marginBottom: 6,
              }}
            >
              Why linked
            </Text>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.text,
                lineHeight: 20,
              }}
            >
              {selectedThread.ellie_observation}
            </Text>
          </View>
        ) : (
          <Text
            style={{
              textAlign: "center",
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
            }}
          >
            Tap a connecting line to see why two moments are linked.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

export default function ThreadsScreen() {
  const { colors } = useTheme();
  const { entries } = useEntries();
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

  const [activeTab, setActiveTab] = useState<"ellie" | "graph">("ellie");
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
          Brain
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
              {tab === "ellie" ? "Insights" : "Graph"}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "graph" ? (
        <ThreadsGraph
          threads={listThreads}
          entries={entries}
          colors={colors}
        />
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
