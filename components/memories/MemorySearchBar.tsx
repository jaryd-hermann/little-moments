import { useRef, useCallback } from "react";
import { View, TextInput, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

/** Matches Memories grouping dropdown (ListViewMemories). */
export const MEMORIES_SEARCH_ROW_HEIGHT = 44;

interface MemorySearchBarProps {
  query: string;
  onChangeQuery: (query: string) => void;
}

export function MemorySearchBar({
  query,
  onChangeQuery,
}: MemorySearchBarProps) {
  const { colors } = useTheme();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const handleChange = useCallback(
    (text: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        onChangeQuery(text);
      }, 300);
    },
    [onChangeQuery]
  );

  const h = MEMORIES_SEARCH_ROW_HEIGHT;

  return (
    <View
      style={{
        height: h,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 12,
      }}
    >
      <Ionicons
        name="search"
        size={18}
        color={colors.textMuted}
      />
      <TextInput
        defaultValue={query}
        onChangeText={handleChange}
        placeholder="Search your moments"
        placeholderTextColor={colors.tabIconDefault}
        autoFocus={false}
        style={{
          flex: 1,
          marginLeft: 8,
          height: h,
          paddingVertical: 0,
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          lineHeight: 18,
          color: colors.text,
          textAlignVertical: "center",
          ...(Platform.OS === "android"
            ? { includeFontPadding: false }
            : {}),
        }}
      />
    </View>
  );
}
