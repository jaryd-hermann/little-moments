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
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useThreads } from "@/hooks/useThreads";
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

function GraphComingSoon() {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 40,
      }}
      showsVerticalScrollIndicator={false}
    >
      <EllieMessage
        showAvatar
        content={
          "We're still working on building this feature and will let you know when it's ready.\n\n" +
          "The idea is a visual graph threading your moments together where it matters."
        }
      />
    </ScrollView>
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
              {tab === "ellie" ? "Insights" : "Graph"}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === "graph" ? (
        <GraphComingSoon />
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
