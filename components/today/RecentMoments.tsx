import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface RecentMomentsProps {
  entries: Entry[];
}

export function RecentMoments({ entries }: RecentMomentsProps) {
  const { colors } = useTheme();
  if (entries.length === 0) return null;

  return (
    <View>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 11,
          color: colors.textMuted,
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        RECENT MOMENTS
      </Text>

      <View style={{ gap: 10 }}>
        {entries.slice(0, 5).map((entry) => {
          const dateStr = entry.entry_date
            ? format(new Date(entry.entry_date), "MMM d")
            : entry.entry_month
              ? `${entry.entry_month}/${entry.entry_year}`
              : `${entry.entry_year}`;

          const plainBody = stripHtml(entry.body);
          const bodyPreview =
            plainBody.length > 80
              ? plainBody.slice(0, 80) + "..."
              : plainBody;

          const thumb =
            entry.media && entry.media.length > 0
              ? entry.media[0].storage_url
              : null;

          return (
            <Pressable
              key={entry.id}
              onPress={() => router.push(`/entry/${entry.id}`)}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.borderLight,
                backgroundColor: colors.surface,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              {thumb && (
                <Image
                  source={{ uri: thumb }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    backgroundColor: colors.surfaceSecondary,
                    marginRight: 12,
                  }}
                />
              )}
              <View style={{ flex: 1 }}>
                {entry.title && (
                  <Text
                    style={{
                      fontFamily: "LibreBaskerville-Bold",
                      fontSize: 15,
                      color: colors.text,
                    }}
                    numberOfLines={1}
                  >
                    {entry.title}
                  </Text>
                )}
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textSecondary,
                    marginTop: 2,
                    lineHeight: 18,
                  }}
                  numberOfLines={2}
                >
                  {bodyPreview}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 11,
                    color: colors.textMuted,
                  }}
                >
                  {dateStr}
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={colors.tabIconDefault}
                  style={{ marginTop: 4 }}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
