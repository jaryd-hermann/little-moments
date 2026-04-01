import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { format, isToday, parseISO } from "date-fns";
import * as Haptics from "expo-haptics";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

interface TodayEntryCardProps {
  entry: Entry | null;
  selectedDate: Date;
  hasDraft?: boolean;
}

function stripEntryHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function TodayEntryCard({
  entry,
  selectedDate,
  hasDraft,
}: TodayEntryCardProps) {
  const { colors, theme } = useTheme();
  const dateLabel = isToday(selectedDate)
    ? "today"
    : format(selectedDate, "MMM d");

  if (!entry) {
    const headline = hasDraft
      ? "You have an unfinished moment"
      : isToday(selectedDate)
        ? "What was your little moment today?"
        : `Add a moment for\n${dateLabel}`;

    const buttonLabel = hasDraft
      ? "Continue writing"
      : "Add a story to remember";

    return (
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
          router.push({
            pathname: "/composer",
            params: {
              date: format(selectedDate, "yyyy-MM-dd"),
            },
          });
        }}
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
          {headline}
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
              {buttonLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  const cardBg = "#FFFFEB";
  const cardText = "#1A1A1A";
  const cardMuted = "rgba(0, 0, 0, 0.55)";
  const cardDate = "rgba(0, 0, 0, 0.45)";

  const hasMedia = entry.media && entry.media.length > 0;
  const firstMedia = hasMedia ? entry.media![0] : null;
  const plainBody = stripEntryHtml(entry.body);

  const dateLine = format(selectedDate, "EEEE, MMMM d");
  const timeLine = entry.created_at
    ? format(parseISO(entry.created_at), "h:mm a")
    : null;

  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor:
          theme === "light" ? "rgba(0, 0, 0, 0.12)" : "rgba(255,255,255,0.12)",
        backgroundColor: cardBg,
        padding: 20,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 14,
          alignItems: "flex-start",
          minHeight: hasMedia ? 120 : undefined,
        }}
      >
        <View
          style={{
            flex: 1,
            minWidth: 0,
            justifyContent: "space-between",
            alignSelf: "stretch",
          }}
        >
          <View>
            {entry.title ? (
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 18,
                  color: cardText,
                }}
                numberOfLines={2}
              >
                {entry.title}
              </Text>
            ) : null}
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: cardMuted,
                marginTop: entry.title ? 6 : 0,
                lineHeight: 22,
              }}
              numberOfLines={hasMedia ? 5 : 3}
            >
              {plainBody}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: cardDate,
              marginTop: 12,
              alignSelf: "flex-start",
            }}
          >
            {dateLine}
            {timeLine ? ` · ${timeLine}` : ""}
          </Text>
        </View>

        {firstMedia ? (
            <EntryMediaImage
              media={firstMedia}
              style={{
                width: 112,
                height: 112,
                borderRadius: 14,
                backgroundColor: "rgba(0,0,0,0.06)",
                borderWidth: 1.5,
                borderColor: "#1A1A1A",
              }}
            />
          ) : null}
      </View>
    </Pressable>
  );
}
