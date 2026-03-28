import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";
import type { Entry } from "@/store/entryStore";
import { format } from "date-fns";

interface EntryCardProps {
  entry: Entry;
  compact?: boolean;
}

export function EntryCard({ entry, compact }: EntryCardProps) {
  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "MMM d")
    : entry.entry_month
      ? `${entry.entry_month}/${entry.entry_year}`
      : `${entry.entry_year}`;

  const bodyPreview =
    entry.body.length > 120
      ? entry.body.slice(0, 120) + "..."
      : entry.body;

  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.1)",
        backgroundColor: "#0A0A0A",
        padding: compact ? 12 : 16,
      }}
    >
      {entry.title && (
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: compact ? 15 : 18,
            color: "#FFFFFF",
          }}
          numberOfLines={1}
        >
          {entry.title}
        </Text>
      )}

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: compact ? 13 : 14,
          color: "rgba(255, 255, 255, 0.7)",
          marginTop: 4,
          lineHeight: compact ? 18 : 22,
        }}
        numberOfLines={2}
      >
        {bodyPreview}
      </Text>

      {entry.media && entry.media.length > 0 && (
        <View style={{ marginTop: 8, flexDirection: "row", gap: 8 }}>
          {entry.media.slice(0, 3).map((m) => (
            <Image
              key={m.id}
              source={{ uri: m.storage_url ?? "" }}
              style={{
                width: compact ? 32 : 48,
                height: compact ? 32 : 48,
                borderRadius: 8,
                backgroundColor: "#1A1A1A",
              }}
            />
          ))}
        </View>
      )}

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: "rgba(255, 255, 255, 0.4)",
          marginTop: 8,
          textAlign: "right",
        }}
      >
        {dateStr}
      </Text>
    </Pressable>
  );
}
