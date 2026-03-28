import { useRef, useCallback } from "react";
import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";

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

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 12,
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
        style={{
          flex: 1,
          marginLeft: 10,
          fontFamily: "Roboto-Regular",
          fontSize: 14,
          color: colors.text,
        }}
      />
    </View>
  );
}
