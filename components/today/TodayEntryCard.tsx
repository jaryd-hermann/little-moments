import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { format, isToday, parseISO } from "date-fns";
import * as Haptics from "expo-haptics";
import type { Entry } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";
import { momentTitleStyle } from "@/lib/momentTypography";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

interface TodayEntryCardProps {
  entry: Entry | null;
  selectedDate: Date;
  hasDraft?: boolean;
  /** Render saved moment as a static preview (no navigation). */
  readOnly?: boolean;
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
  readOnly = false,
}: TodayEntryCardProps) {
  const { colors } = useTheme();
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
          borderWidth: 2,
          borderColor: PINK_CTA_BORDER,
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
            color: PINK_CTA_INK,
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
              borderColor: PINK_CTA_BORDER,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 13,
                color: PINK_CTA_INK,
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

  const cardBg = colors.surface;
  const cardText = colors.text;
  const cardMuted = colors.textSecondary;
  const cardDate = colors.textMuted;

  const hasMedia = entry.media && entry.media.length > 0;
  const firstMedia = hasMedia ? entry.media![0] : null;
  const plainBody = stripEntryHtml(entry.body);

  const dateLine = format(selectedDate, "EEEE, MMMM d");
  const timeLine = entry.created_at
    ? format(parseISO(entry.created_at), "h:mm a")
    : null;

  const outerStyle = {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: cardBg,
    padding: 20,
  };

  const inner = (
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
              style={momentTitleStyle({
                fontSize: 18,
                color: cardText,
              })}
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
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1.5,
            borderColor: colors.text,
          }}
        />
      ) : null}
    </View>
  );

  if (readOnly) {
    return <View style={outerStyle}>{inner}</View>;
  }

  return (
    <Pressable
      onPress={() => router.push(`/entry/${entry.id}`)}
      style={outerStyle}
    >
      {inner}
    </Pressable>
  );
}
