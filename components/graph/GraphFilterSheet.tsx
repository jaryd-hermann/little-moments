import { useMemo } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import type { GraphNode, CanonicalMap } from "@/hooks/useGraph";
import type { GraphFilter } from "./GraphWebView";
import type { HullMode } from "./graphWebContent";
import { THEME_LABEL, type Theme } from "@/constants/GraphPalette";

/**
 * Bottom-sheet modal for graph filters. Replaces the old horizontal chip
 * bar — freeing vertical space for the map and giving chips room to wrap
 * into readable sections (time, cluster mode, themes, people, places).
 */

interface GraphFilterSheetProps {
  visible: boolean;
  onClose: () => void;
  nodes: GraphNode[];
  people: CanonicalMap;
  places: CanonicalMap;
  filter: GraphFilter;
  hullMode: HullMode;
  onFilterChange: (filter: GraphFilter) => void;
  onHullModeChange: (mode: HullMode) => void;
}

const PEOPLE_CHIP_LIMIT = 20;
const PLACES_CHIP_LIMIT = 20;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: active ? colors.primary : "transparent",
        borderWidth: 1,
        borderColor: active ? "#000000" : colors.border,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 13,
          color: active ? "#1A1A1A" : colors.textSecondary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 12,
          color: colors.textMuted,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

export function GraphFilterSheet({
  visible,
  onClose,
  nodes,
  people,
  places,
  filter,
  hullMode,
  onFilterChange,
  onHullModeChange,
}: GraphFilterSheetProps) {
  const { colors } = useTheme();

  const availableThemes = useMemo(() => {
    const present = new Set<string>();
    for (const n of nodes) if (n.primary_theme) present.add(n.primary_theme);
    return (Object.keys(THEME_LABEL) as Theme[]).filter((t) => present.has(t));
  }, [nodes]);

  const topPeople = useMemo(
    () =>
      Object.entries(people)
        .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
        .slice(0, PEOPLE_CHIP_LIMIT)
        .map(([canonical]) => canonical),
    [people]
  );

  const topPlaces = useMemo(
    () =>
      Object.entries(places)
        .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
        .slice(0, PLACES_CHIP_LIMIT)
        .map(([canonical]) => canonical),
    [places]
  );

  const toggleInArray = (arr: string[], value: string): string[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const setTimeRange = (v: GraphFilter["timeRange"]) =>
    onFilterChange({ ...filter, timeRange: v });

  const activeCount =
    (filter.themes.length > 0 ? 1 : 0) +
    (filter.people.length > 0 ? 1 : 0) +
    (filter.places.length > 0 ? 1 : 0) +
    (filter.timeRange !== "all" ? 1 : 0);

  const resetAll = () =>
    onFilterChange({ themes: [], people: [], places: [], timeRange: "all" });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.35)",
          justifyContent: "flex-end",
        }}
      >
        {/* Sheet — intercepts presses so tapping inside doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "80%",
            paddingTop: 8,
          }}
        >
          <View>
            {/* Grabber */}
            <View
              style={{
                alignSelf: "center",
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: colors.border,
                marginBottom: 12,
              }}
            />

            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 20,
                  color: colors.text,
                }}
              >
                Filters
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
              >
                {activeCount > 0 ? (
                  <Pressable onPress={resetAll} hitSlop={10}>
                    <Text
                      style={{
                        fontFamily: "Roboto-Medium",
                        fontSize: 13,
                        color: colors.textSecondary,
                      }}
                    >
                      Reset
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons
                    name="close"
                    size={22}
                    color={colors.textSecondary}
                  />
                </Pressable>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              <Section title="Time">
                <Chip
                  label="All time"
                  active={filter.timeRange === "all"}
                  onPress={() => setTimeRange("all")}
                />
                <Chip
                  label="This year"
                  active={filter.timeRange === "year"}
                  onPress={() => setTimeRange("year")}
                />
                <Chip
                  label="3 months"
                  active={filter.timeRange === "3months"}
                  onPress={() => setTimeRange("3months")}
                />
              </Section>

              <Section title="Cluster by">
                <Chip
                  label="Themes"
                  active={hullMode === "theme"}
                  onPress={() => onHullModeChange("theme")}
                />
                <Chip
                  label="People"
                  active={hullMode === "person"}
                  onPress={() => onHullModeChange("person")}
                />
                <Chip
                  label="None"
                  active={hullMode === "none"}
                  onPress={() => onHullModeChange("none")}
                />
              </Section>

              {availableThemes.length > 0 ? (
                <Section title="Themes">
                  {availableThemes.map((t) => (
                    <Chip
                      key={`theme-${t}`}
                      label={THEME_LABEL[t]}
                      active={filter.themes.includes(t)}
                      onPress={() =>
                        onFilterChange({
                          ...filter,
                          themes: toggleInArray(filter.themes, t),
                        })
                      }
                    />
                  ))}
                </Section>
              ) : null}

              {topPeople.length > 0 ? (
                <Section title="People">
                  {topPeople.map((p) => (
                    <Chip
                      key={`person-${p}`}
                      label={p}
                      active={filter.people.includes(p)}
                      onPress={() =>
                        onFilterChange({
                          ...filter,
                          people: toggleInArray(filter.people, p),
                        })
                      }
                    />
                  ))}
                </Section>
              ) : null}

              {topPlaces.length > 0 ? (
                <Section title="Places">
                  {topPlaces.map((pl) => (
                    <Chip
                      key={`place-${pl}`}
                      label={pl}
                      active={filter.places.includes(pl)}
                      onPress={() =>
                        onFilterChange({
                          ...filter,
                          places: toggleInArray(filter.places, pl),
                        })
                      }
                    />
                  ))}
                </Section>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
