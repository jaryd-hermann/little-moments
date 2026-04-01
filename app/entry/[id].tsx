import { useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Alert, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from "react-native-reanimated";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";
import type { Entry } from "@/store/entryStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";

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
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, deleteEntry } = useEntries();
  const [entry, setEntry] = useState<Entry | null>(null);
  const peekDragY = useSharedValue(0);

  const timeline = useMemo(() => {
    return [...entries].sort((a, b) => {
      const ta = a.entry_date ?? `${a.entry_year}-01-01`;
      const tb = b.entry_date ?? `${b.entry_year}-01-01`;
      return tb.localeCompare(ta);
    });
  }, [entries]);

  const previousEntry = useMemo(() => {
    if (!entry) return null;
    const i = timeline.findIndex((e) => e.id === entry.id);
    if (i < 0 || i >= timeline.length - 1) return null;
    return timeline[i + 1];
  }, [timeline, entry?.id]);

  const goToPreviousInTimeline = useCallback(() => {
    if (previousEntry) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.replace(`/entry/${previousEntry.id}`);
    }
  }, [previousEntry]);

  const peekAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: peekDragY.value }],
  }));

  const peekGesture = useMemo(
    () =>
      Gesture.Pan()
        .failOffsetX([-44, 44])
        .onUpdate((e) => {
          if (e.translationY < 0) {
            peekDragY.value = e.translationY * 0.45;
          }
        })
        .onEnd((e) => {
          const up = e.translationY < -36 || e.velocityY < -420;
          const tapLike =
            Math.abs(e.translationY) < 14 &&
            Math.abs(e.translationX) < 14 &&
            Math.abs(e.velocityY) < 220;
          if (up || tapLike) {
            runOnJS(goToPreviousInTimeline)();
          }
          peekDragY.value = withSpring(0, { damping: 18, stiffness: 220 });
        }),
    [goToPreviousInTimeline]
  );

  const peekHeight = previousEntry ? 76 + insets.bottom : 0;

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

  const previousTitle =
    previousEntry &&
    (previousEntry.title?.trim() ||
      stripHtml(previousEntry.body).slice(0, 72) ||
      "Moment");

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
        {entry.entry_type !== "chapter" && (
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
        )}
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: previousEntry ? peekHeight + 24 : 48 }}
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

        {entry.media && entry.media.length > 0 && (
          <View style={{ marginTop: 24, gap: 12 }}>
            {entry.media.map((m) => (
              <EntryMediaImage
                key={m.id}
                media={m}
                style={{
                  width: windowWidth - 40,
                  aspectRatio: 4 / 3,
                  borderRadius: 12,
                  backgroundColor: colors.surfaceSecondary,
                  alignSelf: "center",
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {previousEntry && previousTitle ? (
        <GestureDetector gesture={peekGesture}>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 0,
                paddingBottom: insets.bottom,
                paddingHorizontal: 14,
                paddingTop: 12,
                backgroundColor: "rgba(0,0,0,0.82)",
                borderTopLeftRadius: 18,
                borderTopRightRadius: 18,
                borderTopWidth: 3,
                borderLeftWidth: 3,
                borderRightWidth: 3,
                borderColor: "rgba(255,255,255,0.95)",
              },
              peekAnimatedStyle,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 16,
                  color: "#FFFFFF",
                  flex: 1,
                }}
                numberOfLines={2}
              >
                {previousTitle}
              </Text>
              <Text
                style={{
                  fontFamily: "Roboto-Light",
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  fontStyle: "italic",
                }}
              >
                swipe up
              </Text>
            </View>
          </Animated.View>
        </GestureDetector>
      ) : null}
    </SafeAreaView>
  );
}
