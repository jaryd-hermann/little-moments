import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";
import type { Entry } from "@/store/entryStore";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function EntryDetailScreen() {
  const { colors, theme } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, deleteEntry } = useEntries();
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    const found = entries.find((e) => e.id === id);
    if (found) {
      setEntry(found);
    } else if (id) {
      supabase
        .from("entries")
        .select("*, entry_media(*)")
        .eq("id", id)
        .single()
        .then(({ data }) => {
          if (data) {
            setEntry({
              ...data,
              media: data.entry_media ?? [],
            } as Entry);
          }
        });
    }
  }, [id, entries]);

  const handleDelete = () => {
    Alert.alert(
      "Delete Entry",
      "This cannot be undone. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (id) {
              await deleteEntry(id);
              router.back();
            }
          },
        },
      ]
    );
  };

  if (!entry) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 14,
            color: colors.textMuted,
          }}
        >
          Loading...
        </Text>
      </SafeAreaView>
    );
  }

  const dateStr = entry.entry_date
    ? format(new Date(entry.entry_date), "EEEE, MMMM d, yyyy")
    : entry.entry_month
      ? `${format(new Date(entry.entry_year, entry.entry_month - 1), "MMMM yyyy")}`
      : `${entry.entry_year}`;

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 20,
          paddingVertical: 12,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{ flexDirection: "row", alignItems: "center" }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.icon} />
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              color: colors.textMuted,
              marginLeft: 4,
            }}
          >
            Back
          </Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <Pressable onPress={handleDelete}>
            <Ionicons
              name="trash-outline"
              size={20}
              color="rgba(255, 255, 255, 0.4)"
            />
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/composer",
                params: { entryId: entry.id },
              })
            }
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.primary,
              }}
            >
              Edit
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        {entry.title && (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              color: colors.text,
            }}
          >
            {entry.title}
          </Text>
        )}

        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
            }}
          >
            {dateStr}
          </Text>
          <View
            style={{
              borderRadius: 9999,
              backgroundColor: colors.surfaceSecondary,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              {entry.entry_type === "crash_and_burn"
                ? "Memory Jog"
                : "Moment"}
            </Text>
          </View>
          {entry.is_ai_enhanced && (
            <View
              style={{
                borderRadius: 9999,
                backgroundColor: colors.primaryLight + "28",
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 11,
                  color: colors.primary,
                }}
              >
                AI Enhanced
              </Text>
            </View>
          )}
        </View>

        {entry.media && entry.media.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 16 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {entry.media.map((m) => (
              <Image
                key={m.id}
                source={{ uri: m.storage_url ?? "" }}
                style={{
                  height: 192,
                  width: 288,
                  borderRadius: 12,
                  backgroundColor: "#1A1A1A",
                }}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        )}

        {entry.entry_type === "crash_and_burn" &&
        entry.is_ai_enhanced &&
        entry.ai_enhanced_body ? (
          <View style={{ marginTop: 24 }}>
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.primary,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              EXTRACTED STORY
            </Text>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                lineHeight: 28,
                color: colors.text,
              }}
            >
              {stripHtml(entry.ai_enhanced_body)}
            </Text>

            <View
              style={{
                height: 1,
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                marginVertical: 16,
              }}
            />

            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 11,
                color: colors.textMuted,
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              RAW RACE
            </Text>
            <Text
              style={{
                fontFamily: "LibreBaskerville-Regular",
                fontSize: 16,
                lineHeight: 28,
                color: colors.textMuted,
              }}
            >
              {stripHtml(entry.original_body ?? entry.body)}
            </Text>
          </View>
        ) : (
          <Text
            style={{
              fontFamily: "LibreBaskerville-Regular",
              fontSize: 16,
              lineHeight: 28,
              color: colors.text,
              marginTop: 24,
            }}
          >
            {stripHtml(entry.body)}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
