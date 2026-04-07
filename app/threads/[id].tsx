import { useEffect, useState, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  format,
  differenceInMonths,
  differenceInDays,
} from "date-fns";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import type { Thread, ThreadEntry } from "@/hooks/useThreads";
import {
  THREAD_DEV_PREVIEW_ID,
  makeDummyThread,
  useThreadDevStore,
} from "@/store/threadDevStore";
import { threadDetailHeadingFromOrdinal } from "@/lib/threadOrdinal";

const CONNECTION_LABELS: Record<string, string> = {
  thematic: "Thematic",
  emotional: "Emotional signature",
  person: "Recurring person",
  place: "Recurring place",
  pattern: "Longitudinal pattern",
  evolution: "Evolution",
};

const THREAD_INSIGHT_BG = "#FECFB4";

function renderInsightRichText(
  raw: string,
  baseStyle: {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    color: string;
  }
): ReactNode {
  const parts = raw.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return raw;
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={i} style={{ ...baseStyle, fontFamily: "Roboto-Bold" }}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function timeGapLabel(dateA?: string | null, dateB?: string | null): string {
  if (!dateA || !dateB) return "";
  const a = new Date(dateA);
  const b = new Date(dateB);
  const months = Math.abs(differenceInMonths(a, b));
  if (months >= 2) return `${months} months apart`;
  const days = Math.abs(differenceInDays(a, b));
  if (days >= 14) return `${Math.round(days / 7)} weeks apart`;
  return `${days} days apart`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function EntryView({ entry }: { entry: ThreadEntry }) {
  const { colors } = useTheme();
  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "MMMM d, yyyy")
    : "";
  const body = stripHtml(entry.ai_enhanced_body ?? entry.body);

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 18,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 12,
          color: colors.textMuted,
          marginBottom: 4,
        }}
      >
        {dateStr}
      </Text>
      {entry.title && (
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 16,
            color: colors.text,
            marginBottom: 10,
          }}
        >
          {entry.title}
        </Text>
      )}
      <Text
        style={{
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          color: colors.textSecondary,
          lineHeight: 24,
        }}
      >
        {body}
      </Text>
    </View>
  );
}

export default function ThreadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [threadOrdinal, setThreadOrdinal] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;

    setThreadOrdinal(null);

    if (
      __DEV__ &&
      id === THREAD_DEV_PREVIEW_ID &&
      useThreadDevStore.getState().dummyThreadEnabled
    ) {
      setThread(makeDummyThread());
      setThreadOrdinal(1);
      setLoading(false);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("threads")
        .select(
          `
          *,
          entry_a:entries!threads_entry_id_a_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type)),
          entry_b:entries!threads_entry_id_b_fkey(id, title, body, ai_enhanced_body, entry_date, created_at, entry_media(id, storage_url, media_type))
        `
        )
        .eq("id", id)
        .single();

      if (data) {
        const mapped: Thread = {
          ...data,
          questions: (data.questions as string[]) ?? [],
          entry_a: data.entry_a
            ? { ...data.entry_a, media: data.entry_a.entry_media ?? [] }
            : null,
          entry_b: data.entry_b
            ? { ...data.entry_b, media: data.entry_b.entry_media ?? [] }
            : null,
        };
        setThread(mapped);

        const { data: ordRows } = await supabase
          .from("threads")
          .select("id, created_at")
          .eq("user_id", mapped.user_id)
          .eq("dismissed", false);

        const rows = ordRows ?? [];
        rows.sort((a, b) => {
          const ta = new Date(a.created_at).getTime();
          const tb = new Date(b.created_at).getTime();
          if (ta !== tb) return ta - tb;
          return a.id.localeCompare(b.id);
        });
        const idx = rows.findIndex((r) => r.id === mapped.id);
        setThreadOrdinal(idx >= 0 ? idx + 1 : 1);
      } else {
        setThread(null);
      }
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!thread) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}
      >
        <Text style={{ color: colors.textSecondary }}>Thread not found.</Text>
      </SafeAreaView>
    );
  }

  const typeBase = CONNECTION_LABELS[thread.connection_type] ?? "Thread";
  const typeTag = `${typeBase} thread`;
  const gap = timeGapLabel(
    thread.entry_a?.entry_date,
    thread.entry_b?.entry_date
  );

  const insightTextStyle = {
    fontFamily: "Roboto-Regular" as const,
    fontSize: 15,
    lineHeight: 24,
    color: "#1A1A1A",
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 48,
        }}
      >
        {threadOrdinal != null ? (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              color: colors.text,
              marginBottom: 14,
            }}
          >
            {threadDetailHeadingFromOrdinal(threadOrdinal)}
          </Text>
        ) : null}

        <View
          style={{
            backgroundColor: THREAD_INSIGHT_BG,
            borderRadius: 20,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
            }}
          >
            <View
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.06)",
                borderWidth: 1,
                borderColor: "#1A1A1A",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 13,
                  color: "#1A1A1A",
                }}
              >
                {typeTag}
              </Text>
            </View>
            {gap ? (
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 12,
                  color: "#3D3D3D",
                }}
              >
                {gap}
              </Text>
            ) : null}
          </View>

          <Text style={insightTextStyle}>
            {renderInsightRichText(thread.ellie_observation, insightTextStyle)}
          </Text>
        </View>

        {thread.questions.length > 0 ? (
          <EllieMessage
            content={thread.questions.join("\n\n")}
            showAvatar
          />
        ) : null}

        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0.3,
            marginBottom: 12,
            marginTop: 4,
          }}
        >
          Threaded between these moments
        </Text>

        {thread.entry_a && (
          <View style={{ marginBottom: 14 }}>
            <EntryView entry={thread.entry_a} />
          </View>
        )}

        {thread.entry_b && (
          <View style={{ marginBottom: 20 }}>
            <EntryView entry={thread.entry_b} />
          </View>
        )}

        <Pressable
          onPress={() => router.replace("/threads")}
          style={{
            marginTop: 8,
            height: 52,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#000000",
            }}
          >
            All Threads
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
