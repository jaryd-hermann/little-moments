import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import type { Entry } from "@/store/entryStore";
import { format } from "date-fns";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import { momentTitleStyle } from "@/lib/momentTypography";

interface EntryCardProps {
  entry: Entry;
  compact?: boolean;
}

export function EntryCard({ entry, compact }: EntryCardProps) {
  const { colors } = useTheme();
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
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: compact ? 12 : 16,
      }}
    >
      {entry.title && (
        <Text
          style={momentTitleStyle({
            fontSize: compact ? 15 : 18,
            color: colors.text,
          })}
          numberOfLines={1}
        >
          {entry.title}
        </Text>
      )}

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: compact ? 13 : 14,
          color: colors.textSecondary,
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
            <EntryMediaImage
              key={m.id}
              media={m}
              style={{
                width: compact ? 32 : 48,
                height: compact ? 32 : 48,
                borderRadius: 8,
                backgroundColor: colors.surfaceSecondary,
              }}
            />
          ))}
        </View>
      )}

      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.textMuted,
          marginTop: 8,
          textAlign: "right",
        }}
      >
        {dateStr}
      </Text>
    </Pressable>
  );
}
