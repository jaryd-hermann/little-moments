import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { format, isToday } from "date-fns";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";

interface TodayEntryCardProps {
  entry: Entry | null;
  selectedDate: Date;
}

export function TodayEntryCard({
  entry,
  selectedDate,
}: TodayEntryCardProps) {
  const { colors, theme } = useTheme();
  const dateLabel = isToday(selectedDate)
    ? "today"
    : format(selectedDate, "MMM d");

  if (!entry) {
    return (
      <Pressable
        onPress={() =>
          router.push({
            pathname: "/composer",
            params: {
              date: format(selectedDate, "yyyy-MM-dd"),
            },
          })
        }
        style={{
          borderRadius: 16,
          backgroundColor: colors.primary,
          borderWidth: theme === "light" ? 2 : 0,
          borderColor: theme === "light" ? "#1A1A1A" : "transparent",
          paddingTop: 32,
          paddingBottom: 20,
          paddingHorizontal: 20,
          minHeight: 120,
        }}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: "#1A1A1A",
            lineHeight: 26,
            textAlign: "center",
          }}
        >
          {isToday(selectedDate)
            ? "What was your little moment today?"
            : `Add a moment for\n${dateLabel}`}
        </Text>
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <View
            style={{
              borderRadius: 9999,
              borderWidth: 2,
              borderColor: "#1A1A1A",
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: "#1A1A1A",
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Add a story to remember
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 20,
      }}
    >
      {entry.title && (
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 18,
            color: colors.text,
          }}
          numberOfLines={1}
        >
          {entry.title}
        </Text>
      )}
      <Text
        style={{
          fontFamily: "LibreBaskerville-Regular",
          fontSize: 14,
          color: colors.textSecondary,
          marginTop: 6,
          lineHeight: 22,
        }}
        numberOfLines={2}
      >
        {entry.body.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()}
      </Text>

      {entry.media && entry.media.length > 0 && (
        <View className="mt-3 flex-row gap-2">
          {entry.media.slice(0, 3).map((m) => (
            <Image
              key={m.id}
              source={{ uri: m.storage_url ?? "" }}
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: colors.surfaceSecondary,
              }}
            />
          ))}
        </View>
      )}

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 8,
          textAlign: "right",
        }}
      >
        {format(selectedDate, "EEEE, MMMM d")}
      </Text>
    </Pressable>
  );
}
