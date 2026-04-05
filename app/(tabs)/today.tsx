import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { AppHeader } from "@/components/common/AppHeader";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import { EllieChatFlow, type InputMethod } from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { ChapterCard } from "@/components/today/ChapterCard";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { useEntries } from "@/hooks/useEntries";
import { useStreak } from "@/hooks/useStreak";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useChapters } from "@/hooks/useChapters";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { useChapterDevStore } from "@/store/chapterStore";
import { getDailyPrompt } from "@/lib/dailyPrompt";
import { shareInvite } from "@/lib/inviteShare";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import type { PromptType } from "@/lib/momentAssist";
import type { Entry } from "@/store/entryStore";

const CREAM = "#FFFFEB";
const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");

export default function TodayScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const posthog = usePostHog();
  const { entries, fetchEntries, saveEntry } = useEntries();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const {
    streakCount,
    isAtRisk,
    longestStreak,
    totalMoments,
    memoryRaceCount,
    avgStoryLengthWords,
  } = useStreak();
  const { getRandomAsset } = useMediaLibrary();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const { latestChapter: realLatestChapter, fetchChapters } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapter = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapter() : null),
    [dummyEnabled]
  );
  const latestChapter = realLatestChapter ?? dummyChapter;
  const [chapterViewerOpen, setChapterViewerOpen] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [isShuffling, setIsShuffling] = useState(false);
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputMethodRef = useRef<InputMethod | null>(null);

  const savedEntry: Entry | null = useMemo(
    () => (lastSavedEntryId ? entries.find((e) => e.id === lastSavedEntryId) ?? null : null),
    [entries, lastSavedEntryId]
  );

  const dailyPrompt = useMemo(() => getDailyPrompt(), []);
  const promptType: PromptType = dailyPrompt.type;

  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = screenWidth - 40;
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const todayEntries: Entry[] = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.entry_date === format(new Date(), "yyyy-MM-dd") &&
          e.entry_type === "moment"
      ),
    [entries]
  );

  const todayEntry = todayEntries.length > 0 ? todayEntries[0] : null;

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
      fetchChapters();
      setLastSavedEntryId(null);
      setShareModalVisible(false);
      setJustSaved(false);
      inputMethodRef.current = null;
      const pendingId = useChapterNotifStore.getState().consume();
      if (pendingId && latestChapter?.id === pendingId) {
        setChapterViewerOpen(true);
      }
      return () => {
        setTabBarHidden(false);
      };
    }, [fetchEntries, fetchChapters, latestChapter?.id, setTabBarHidden])
  );

  useFocusEffect(
    useCallback(() => {
      const todayCount = entries.filter(
        (e) =>
          e.entry_date === format(new Date(), "yyyy-MM-dd") &&
          e.entry_type === "moment"
      ).length;
      posthog.capture("viewed_today", {
        has_entry_today: todayCount > 0,
        entry_count_today: todayCount,
      });
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (promptType === "photo" && !photoUri) {
        void (async () => {
          const photo = await getRandomAsset();
          if (photo) {
            setPhotoUri(photo.uri);
            setPhotoDate(photo.creationTime);
          }
        })();
      }
    }, [promptType, photoUri, getRandomAsset])
  );

  const handlePhotoShuffle = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsShuffling(true);
    try {
      const photo = await getRandomAsset();
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
      }
    } finally {
      setIsShuffling(false);
    }
  }, [getRandomAsset]);

  const handleComplete = useCallback(
    async (entry: { title: string; body: string; rawText: string; attachedPhotoUri?: string }) => {
      setJustSaved(true);
      const today = format(new Date(), "yyyy-MM-dd");
      const saved = await saveEntry({
        title: entry.title,
        body: entry.body,
        entry_type: "moment",
        entry_date: today,
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: promptType === "word" ? dailyPrompt.value : null,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: null,
        chapter_id: null,
      });

      if (saved?.id) setLastSavedEntryId(saved.id);

      posthog.capture("moment_saved", {
        source: "today",
        prompt_type: promptType,
        input_method: inputMethodRef.current,
      });

      if (entry.attachedPhotoUri && userId && saved?.id) {
        const entryId = saved.id;
        void (async () => {
          try {
            const { publicUrl, storagePath } = await uploadEntryMedia(
              userId,
              entryId,
              entry.attachedPhotoUri!,
              "image"
            );
            await supabase.from("entry_media").insert({
              entry_id: entryId,
              user_id: userId,
              storage_path: storagePath,
              storage_url: publicUrl,
              media_type: "image",
              display_order: 0,
            });
            console.log("[TodayScreen] Photo uploaded and linked");
            await fetchEntries();
          } catch (err) {
            console.error("[TodayScreen] Failed to upload media:", err);
          }
        })();
      }

      await fetchEntries();
    },
    [saveEntry, promptType, dailyPrompt.value, posthog, userId, fetchEntries]
  );

  const effectivePromptType = promptType;
  const effectivePromptValue = dailyPrompt.value;

  const hasRealName =
    !!profile?.display_name?.trim() &&
    profile.display_name.trim() !== profile.email;
  const firstName = hasRealName
    ? profile!.display_name!.trim().split(/\s+/)[0]
    : null;

  const afterSaveNode = (
    <View>
      <CongratsCard
        headline="Moment saved!"
        totalMoments={totalMoments + 1}
        streakCount={streakCount}
      />
      <EllieMessage
        content={`Nice work — that's ${streakCount + 1} day${streakCount !== 0 ? "s" : ""} in a row. Your Capsule is growing. Where to next?`}
      />
      <View style={{ gap: 10, marginTop: 12 }}>
        <Pressable
          onPress={() => setShareModalVisible(true)}
          style={{
            height: 48,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="heart-outline" size={18} color="#1A1A1A" />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: "#1A1A1A",
            }}
          >
            Share this moment with someone
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void shareInvite()}
          style={{
            height: 48,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="send-outline" size={16} color={colors.textSecondary} />
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textSecondary,
            }}
          >
            Suggest this app to someone
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setTabBarHidden(false);
            setJustSaved(false);
          }}
          style={{
            height: 48,
            borderRadius: 9999,
            backgroundColor: colors.surfaceSecondary,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Ionicons name="checkmark" size={18} color={colors.text} />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: colors.text,
            }}
          >
            I'm done
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader
        streakCount={streakCount}
        isAtRisk={isAtRisk}
        displayName={profile?.display_name}
        avatarUrl={profile?.avatar_url}
        longestStreak={longestStreak}
        totalMoments={totalMoments}
        memoryRaceCount={memoryRaceCount}
        avgStoryLengthWords={avgStoryLengthWords}
        memberSince={profile?.created_at}
      />

      {todayEntry && !justSaved ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <EllieMessage
            content={`You've already captured today's moment. Nice work — that's ${streakCount} day${streakCount !== 1 ? "s" : ""} in a row.`}
          />

          {/* Today's moments — carousel if multiple */}
          <View style={{ marginHorizontal: -20, marginBottom: 20 }}>
            <FlatList
              data={todayEntries}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              snapToInterval={CARD_WIDTH + 12}
              decelerationRate="fast"
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const idx = Math.round(
                  e.nativeEvent.contentOffset.x / (CARD_WIDTH + 12)
                );
                setActiveCardIndex(idx);
              }}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => {
                const media =
                  item.media && item.media.length > 0 ? item.media[0] : null;
                return (
                  <Pressable
                    onPress={() => {
                      posthog.capture("today_entry_tapped", { entry_id: item.id });
                      router.push(`/entry/${item.id}`);
                    }}
                    style={{
                      width: CARD_WIDTH,
                      marginRight: index < todayEntries.length - 1 ? 12 : 0,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: "rgba(0,0,0,0.08)",
                      backgroundColor: CREAM,
                      overflow: "hidden",
                    }}
                  >
                    {media && (
                      <EntryMediaImage
                        media={media}
                        style={{
                          width: "100%",
                          height: 220,
                        }}
                      />
                    )}
                    <View style={{ padding: 16 }}>
                      {item.title && (
                        <Text
                          style={{
                            fontFamily: "LibreBaskerville-Bold",
                            fontSize: 16,
                            color: "#1A1A1A",
                            marginBottom: 6,
                          }}
                        >
                          {item.title}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontFamily: "Roboto-Regular",
                          fontSize: 14,
                          lineHeight: 22,
                          color: "#333333",
                        }}
                        numberOfLines={4}
                      >
                        {item.body}
                      </Text>
                      {item.word_of_day && (
                        <View
                          style={{
                            marginTop: 10,
                            alignSelf: "flex-start",
                            borderRadius: 8,
                            backgroundColor: "rgba(0,0,0,0.06)",
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Roboto-Regular",
                              fontSize: 12,
                              color: "#555555",
                            }}
                          >
                            starting word:{" "}
                            <Text style={{ fontFamily: "Roboto-Medium" }}>
                              {item.word_of_day.toLowerCase()}
                            </Text>
                          </Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
            {todayEntries.length > 1 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {todayEntries.map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: i === activeCardIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === activeCardIndex
                          ? colors.primary
                          : colors.textMuted,
                    }}
                  />
                ))}
              </View>
            )}
          </View>

          {latestChapter && (
            <View style={{ marginBottom: 20 }}>
              <EllieMessage
                content="I've created your monthly chapter. Tap to view it."
                showAvatar
              />
              <ChapterCard
                chapter={latestChapter}
                onPress={() => setChapterViewerOpen(true)}
              />
            </View>
          )}

          {!hasRealName && (
            <View style={{ marginBottom: 12 }}>
              <EllieMessage
                showAvatar
                content="Also, I don't know your name yet. What should I call you?"
              />
              <Pressable
                onPress={() => router.push("/settings")}
                style={{
                  height: 44,
                  borderRadius: 9999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  Share my name
                </Text>
              </Pressable>
            </View>
          )}

          {/* Ellie CTA to capture another moment */}
          <EllieMessage
            content="Come back tomorrow for your next daily word, photo, or prompt. Or if you're feeling inspired, I can help capture another moment with you now."
          />
          <Pressable
            onPress={() => router.push("/(tabs)/add")}
            style={{
              height: 48,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: "#1A1A1A",
              }}
            >
              Capture another moment
            </Text>
          </Pressable>

          {/* Invite + Feedback */}
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={() => void shareInvite()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 48,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  color: colors.textSecondary,
                }}
              >
                Invite a Friend
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                posthog.capture("feedback_button_pressed", { source: "today" });
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                height: 48,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="chatbox-outline" size={18} color={colors.textSecondary} />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  color: colors.textSecondary,
                }}
              >
                Give Feedback
              </Text>
            </Pressable>
          </View>

          {(profile?.subscription_status === "free" ||
            profile?.subscription_status === "trial") && (
            <Pressable
              onPress={() => {
                posthog.capture("premium_card_tapped", { source: "today" });
                router.push("/ellie-premium");
              }}
              style={{ marginTop: 24 }}
            >
              <View
                style={{
                  backgroundColor: "#202020",
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: "#FECFB4",
                  paddingHorizontal: 24,
                  paddingVertical: 24,
                }}
              >
                <Image
                  source={WORDMARK_PREMIUM}
                  style={{ height: 36, width: "100%", alignSelf: "center" }}
                  contentFit="contain"
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 14,
                    color: "#FFFFFF",
                    textAlign: "center",
                    marginTop: 18,
                  }}
                >
                  See if becoming a Premium member is right for you
                </Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      ) : (
        <EllieChatFlow
          promptType={effectivePromptType}
          promptValue={effectivePromptValue}
          photoUri={photoUri}
          photoDate={photoDate}
          isShufflingPhoto={isShuffling}
          onComplete={handleComplete}
          onPhotoShuffle={
            effectivePromptType === "photo" ? handlePhotoShuffle : undefined
          }
          afterSaveNode={afterSaveNode}
          welcomeMessages={[
            streakCount > 0
              ? firstName
                ? `Welcome back, ${firstName}. Day ${streakCount + 1} — let's keep it going.`
                : `Welcome back. Day ${streakCount + 1} — let's keep it going.`
              : firstName
                ? `Hey ${firstName}. Ready to capture today's moment?`
                : "Hey there. Ready to capture today's moment?",
          ]}
          extraGuidance={
            effectivePromptType === "question"
              ? "Think about little things — a conversation, a meal, something someone you love said to you. Not the big symbolic moments. The ones you'll forget."
              : undefined
          }
          onFlowStarted={(inputMethod) => {
            inputMethodRef.current = inputMethod;
            posthog.capture("today_flow_started", {
              prompt_type: effectivePromptType,
              input_method: inputMethod,
            });
            setTabBarHidden(true);
          }}
        />
      )}

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />

      <ChapterStoryViewer
        visible={chapterViewerOpen && !!latestChapter}
        chapter={latestChapter}
        onClose={() => setChapterViewerOpen(false)}
      />
    </SafeAreaView>
  );
}
