import { useMemo, useState } from "react";
import { View, Text, SectionList, Pressable } from "react-native";
import { format } from "date-fns";
import {
  MemorySearchBar,
  MEMORIES_SEARCH_ROW_HEIGHT,
} from "./MemorySearchBar";
import { EntryRow } from "./EntryRow";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";

type Grouping = "day" | "month" | "year";
type LibraryViewMode = "list" | "flipbook";

interface ListViewMemoriesProps {
  entries: Entry[];
  searchQuery: string;
  onChangeQuery: (q: string) => void;
  viewMode: LibraryViewMode;
  onViewModeChange: (mode: LibraryViewMode) => void;
  onOpenChapter?: (chapterId: string) => void;
}

const GROUPING_OPTIONS: { value: Grouping; label: string }[] = [
  { value: "day", label: "By Day" },
  { value: "month", label: "By Month" },
  { value: "year", label: "By Year" },
];

const VIEW_MODE_OPTIONS: { value: LibraryViewMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "flipbook", label: "Flipbook" },
];

export function ListViewMemories({
  entries,
  searchQuery,
  onChangeQuery,
  viewMode,
  onViewModeChange,
  onOpenChapter,
}: ListViewMemoriesProps) {
  const { colors } = useTheme();
  const [grouping, setGrouping] = useState<Grouping>("day");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showViewDropdown, setShowViewDropdown] = useState(false);

  const sections = useMemo(() => {
    const grouped = new Map<string, Entry[]>();

    for (const entry of entries) {
      let key: string;
      const date = entry.entry_date
        ? new Date(entry.entry_date)
        : null;

      if (grouping === "day" && date) {
        key = format(date, "EEEE, MMMM d, yyyy");
      } else if (grouping === "year") {
        key = `${entry.entry_year}`;
      } else {
        key = date
          ? format(date, "MMMM yyyy")
          : `${entry.entry_year}`;
      }

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(entry);
    }

    return Array.from(grouped.entries()).map(([title, data]) => ({
      title,
      count: data.length,
      data,
    }));
  }, [entries, grouping]);

  const currentLabel =
    GROUPING_OPTIONS.find((o) => o.value === grouping)?.label ?? "By Day";

  const currentViewLabel =
    VIEW_MODE_OPTIONS.find((o) => o.value === viewMode)?.label ?? "List";

  const renderMonthCard = (section: { title: string; count: number }) => (
    <Pressable
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 24,
        minHeight: 120,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 24,
      }}
    >
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 18,
          color: colors.text,
        }}
      >
        {section.title}
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 13,
          color: colors.textMuted,
          marginTop: 6,
        }}
      >
        {section.count} little moment{section.count !== 1 ? "s" : ""}
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1">
      {/* Search bar + grouping dropdown inline */}
      <View
        style={{
          width: "100%",
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <MemorySearchBar
            query={searchQuery}
            onChangeQuery={onChangeQuery}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 6, flexShrink: 0 }}>
          <View style={{ position: "relative" }}>
            <Pressable
              onPress={() => {
                setShowDropdown(!showDropdown);
                setShowViewDropdown(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                height: MEMORIES_SEARCH_ROW_HEIGHT,
                minHeight: MEMORIES_SEARCH_ROW_HEIGHT,
                paddingHorizontal: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 12,
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {currentLabel}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                {showDropdown ? "▲" : "▼"}
              </Text>
            </Pressable>
            {showDropdown && (
              <View
                style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  zIndex: 100,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSecondary,
                  overflow: "hidden",
                  minWidth: 128,
                }}
              >
                {GROUPING_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setGrouping(opt.value);
                      setShowDropdown(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor:
                        grouping === opt.value
                          ? colors.primaryLight + "28"
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 13,
                        color:
                          grouping === opt.value
                            ? colors.primary
                            : colors.text,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={{ position: "relative" }}>
            <Pressable
              onPress={() => {
                setShowViewDropdown(!showViewDropdown);
                setShowDropdown(false);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                height: MEMORIES_SEARCH_ROW_HEIGHT,
                minHeight: MEMORIES_SEARCH_ROW_HEIGHT,
                paddingHorizontal: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 12,
                  color: colors.text,
                }}
                numberOfLines={1}
              >
                {currentViewLabel}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                {showViewDropdown ? "▲" : "▼"}
              </Text>
            </Pressable>
            {showViewDropdown && (
              <View
                style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  zIndex: 100,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surfaceSecondary,
                  overflow: "hidden",
                  minWidth: 112,
                }}
              >
                {VIEW_MODE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onViewModeChange(opt.value);
                      setShowViewDropdown(false);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      backgroundColor:
                        viewMode === opt.value
                          ? colors.primaryLight + "28"
                          : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 13,
                        color:
                          viewMode === opt.value
                            ? colors.primary
                            : colors.text,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>

      {grouping === "month" || grouping === "year" ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={() => null}
          renderSectionHeader={({ section }) =>
            renderMonthCard(section)
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 12 }}>
              <EntryRow entry={item} onOpenChapter={onOpenChapter} />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 28,
                paddingBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 18,
                  color: colors.text,
                }}
              >
                {section.title}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 12,
                  color: colors.textMuted,
                }}
              >
                {section.count} moment{section.count !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}
