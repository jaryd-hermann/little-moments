import { useState, useCallback, useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { MemorySearchBar } from "@/components/memories/MemorySearchBar";
import { ListViewMemories } from "@/components/memories/ListViewMemories";
import { ThreeDTimeline } from "@/components/memories/ThreeDTimeline";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";

type ViewMode = "list" | "flipbook";

export default function MemoriesScreen() {
  const { colors } = useTheme();
  const { entries, fetchEntries } = useEntries();
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
    }, [fetchEntries])
  );

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        (e.title?.toLowerCase().includes(q) ?? false) ||
        e.body.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  if (viewMode === "flipbook") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ThreeDTimeline
          entries={filteredEntries}
          onExitPress={() => setViewMode("list")}
        />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="px-5 pt-2">
        <View className="mb-4 flex-row items-center justify-between">
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 28,
              color: colors.text,
            }}
          >
            Memories
          </Text>
          <View
            style={{
              flexDirection: "row",
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
            }}
          >
            <Pressable
              onPress={() => setViewMode("flipbook")}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor:
                  viewMode === "flipbook"
                    ? "#FFFFFF"
                    : "transparent",
                borderRadius: 9999,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 13,
                  color:
                    viewMode === "flipbook"
                      ? "#000000"
                      : colors.text,
                }}
              >
                Flipbook
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode("list")}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 6,
                backgroundColor:
                  viewMode === "list"
                    ? "#FFFFFF"
                    : "transparent",
                borderRadius: 9999,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 13,
                  color:
                    viewMode === "list"
                      ? "#000000"
                      : colors.text,
                }}
              >
                List
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="flex-1 px-5">
        <ListViewMemories
          entries={filteredEntries}
          searchQuery={searchQuery}
          onChangeQuery={setSearchQuery}
        />
      </View>
    </SafeAreaView>
  );
}
