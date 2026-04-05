import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

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
        {[...entries]
          .sort((a, b) => {
            const da = a.entry_date ?? "";
            const db = b.entry_date ?? "";
            return db.localeCompare(da);
          })
          .slice(0, 5)
          .map((entry) => {
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

          const firstMedia =
            entry.media && entry.media.length > 0 ? entry.media[0] : null;

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
              <View style={{ flex: 1, minWidth: 0 }}>
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
                {entry.word_of_day ? (
                  <View
                    style={{
                      marginTop: 6,
                      alignSelf: "flex-start",
                      borderRadius: 8,
                      backgroundColor: colors.surfaceSecondary,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Regular",
                        fontSize: 11,
                        color: colors.textMuted,
                      }}
                    >
                      starting word:{" "}
                      <Text style={{ fontFamily: "Roboto-Medium" }}>
                        {entry.word_of_day.toLowerCase()}
                      </Text>
                    </Text>
                  </View>
                ) : null}
              </View>
              {firstMedia ? (
                <EntryMediaImage
                  media={firstMedia}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    marginLeft: 10,
                    marginRight: 10,
                    backgroundColor: colors.surfaceSecondary,
                  }}
                />
              ) : null}
              <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
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
