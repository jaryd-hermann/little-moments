import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { useTheme } from "@/hooks/useTheme";

export type CapsuleFilter = "all" | "moments" | "chapters";

interface CapsuleStatBarProps {
  totalMoments: number;
  totalChapters: number;
  totalThreads: number;
  activeFilter: CapsuleFilter;
  onFilterChange: (filter: CapsuleFilter) => void;
}

export function CapsuleStatBar({
  totalMoments,
  totalChapters,
  totalThreads,
  activeFilter,
  onFilterChange,
}: CapsuleStatBarProps) {
  const { colors } = useTheme();

  const items: { label: string; count: number; filter: CapsuleFilter | "threads" }[] = [
    { label: "Moments", count: totalMoments, filter: "moments" },
    { label: "Chapters", count: totalChapters, filter: "chapters" },
    { label: "Threads", count: totalThreads, filter: "threads" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        gap: 6,
      }}
    >
      {items.map((item, i) => {
        const isActive =
          item.filter !== "threads" && activeFilter === item.filter;

        return (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center" }}>
            {i > 0 && (
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 13,
                  color: colors.textMuted,
                  marginRight: 6,
                }}
              >
                ·
              </Text>
            )}
            <Pressable
              onPress={() => {
                if (item.filter === "threads") {
                  router.push("/threads");
                  return;
                }
                onFilterChange(
                  activeFilter === item.filter ? "all" : item.filter
                );
              }}
              hitSlop={8}
            >
              <Text
                style={{
                  fontFamily: isActive ? "Roboto-Bold" : "Roboto-Regular",
                  fontSize: 13,
                  color: isActive ? colors.text : colors.textSecondary,
                  textDecorationLine: isActive ? "underline" : "none",
                }}
              >
                {item.count} {item.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
