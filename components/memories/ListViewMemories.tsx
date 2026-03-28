import { useMemo, useState } from "react";
import { View, Text, SectionList, Pressable } from "react-native";
import { format } from "date-fns";
import { MemorySearchBar } from "./MemorySearchBar";
import { EntryRow } from "./EntryRow";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";

type Grouping = "day" | "month" | "year";

interface ListViewMemoriesProps {
  entries: Entry[];
  searchQuery: string;
  onChangeQuery: (q: string) => void;
}

const GROUPING_OPTIONS: { value: Grouping; label: string }[] = [
  { value: "day", label: "By Day" },
  { value: "month", label: "By Month" },
  { value: "year", label: "By Year" },
];

export function ListViewMemories({
  entries,
  searchQuery,
  onChangeQuery,
}: ListViewMemoriesProps) {
  const { colors } = useTheme();
  const [grouping, setGrouping] = useState<Grouping>("day");
  const [showDropdown, setShowDropdown] = useState(false);

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
        marginTop: 12,
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
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <MemorySearchBar
            query={searchQuery}
            onChangeQuery={onChangeQuery}
          />
        </View>
        <View style={{ position: "relative" }}>
          <Pressable
            onPress={() => setShowDropdown(!showDropdown)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 10,
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
                fontSize: 13,
                color: colors.text,
              }}
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
                minWidth: 120,
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
            <View style={{ marginBottom: 8 }}>
              <EntryRow entry={item} />
            </View>
          )}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 20,
                paddingBottom: 4,
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
