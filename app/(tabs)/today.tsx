import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  FlatList,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { AppHeader } from "@/components/common/AppHeader";
import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import {
  EllieChatFlow,
  type InputMethod,
  type MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { ChapterCard } from "@/components/today/ChapterCard";
import { ChapterStoryViewer } from "@/components/today/ChapterStoryViewer";
import { useEntries } from "@/hooks/useEntries";
import {
  useStreak,
  type AfterSaveStats,
  type AfterSaveContext,
} from "@/hooks/useStreak";
import { SlideToPinMoment } from "@/components/common/SlideToPinMoment";
import { EntryPinToggle } from "@/components/common/EntryPinToggle";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { hasFullPhotoLibraryAccess, useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useChapters } from "@/hooks/useChapters";
import { useChapterNotifStore } from "@/store/chapterNotifStore";
import { useChapterDevStore } from "@/store/chapterStore";
import { useThreadNotifStore } from "@/store/threadNotifStore";
import { useThreadDevStore, makeDummyThread } from "@/store/threadDevStore";
import { useTodayNotifDevStore } from "@/store/todayNotifDevStore";
import { useThreads } from "@/hooks/useThreads";
import { ThreadCard } from "@/components/threads/ThreadCard";
import { getDailyPrompt } from "@/lib/dailyPrompt";
import { shareInvite } from "@/lib/inviteShare";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import {
  getNotificationPermissionGranted,
  requestNotificationPermissions,
} from "@/lib/notifications";
import { syncPushRegistration } from "@/lib/pushRegistration";
import {
  dismissTodayNotificationNudge,
  isTodayNotificationNudgeDismissed,
} from "@/lib/todayNotificationNudge";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import type { PromptType } from "@/lib/momentAssist";
import type { Entry } from "@/store/entryStore";

const CREAM = "#FFFFEB";
export default function TodayScreen() {
  const { colors } = useTheme();
  const { profile, fetchProfile } = useAuth();
  const setNotificationEnabled = useSettingsStore((s) => s.setNotificationEnabled);
  const notificationTime = useSettingsStore((s) => s.notificationTime);
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
  const {
    getRandomAsset,
    requestPermission,
    checkPermission,
    permissionStatus,
    accessPrivileges,
  } = useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } = useFullPhotoAccessExplainer({
    checkPermission,
    requestPermission,
  });
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const { latestChapter: realLatestChapter, fetchChapters } = useChapters();
  const dummyEnabled = useChapterDevStore((s) => s.dummyChapterEnabled);
  const dummyChapter = useMemo(
    () => (dummyEnabled ? useChapterDevStore.getState().getDummyChapter() : null),
    [dummyEnabled]
  );
  const latestChapter = realLatestChapter ?? dummyChapter;
  const [chapterViewerOpen, setChapterViewerOpen] = useState(false);
  const { todayThreads, fetchAll: fetchThreads, totalConnections } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);
  const dummyNotificationNudgeEnabled = useTodayNotifDevStore(
    (s) => s.dummyNotificationNudgeEnabled
  );

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
  const [todayNotifNudgeVisible, setTodayNotifNudgeVisible] = useState(false);
  const showTodayNotifNudge =
    todayNotifNudgeVisible || (__DEV__ && dummyNotificationNudgeEnabled);
  const todayNotifNudgeIsDevMockOnly =
    __DEV__ && dummyNotificationNudgeEnabled && !todayNotifNudgeVisible;

  const todayEntries: Entry[] = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.entry_date === format(new Date(), "yyyy-MM-dd") &&
          e.entry_type === "moment"
      ),
    [entries]
  );

  const todayEntriesLayoutKey = useMemo(
    () => todayEntries.map((e) => e.id).join(","),
    [todayEntries]
  );
  const todayCardHeightsRef = useRef<Record<string, number>>({});
  const [todayCarouselMinHeight, setTodayCarouselMinHeight] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    todayCardHeightsRef.current = {};
    setTodayCarouselMinHeight(undefined);
  }, [todayEntriesLayoutKey]);

  const todayEntry = todayEntries.length > 0 ? todayEntries[0] : null;

  useFocusEffect(
    useCallback(() => {
      fetchEntries();
      fetchChapters();
      fetchThreads();
      setLastSavedEntryId(null);
      setShareModalVisible(false);
      setJustSaved(false);
      inputMethodRef.current = null;
      const pendingId = useChapterNotifStore.getState().consume();
      if (pendingId && latestChapter?.id === pendingId) {
        setChapterViewerOpen(true);
      }
      const pendingThreadId = useThreadNotifStore.getState().consume();
      if (pendingThreadId) {
        router.push(`/threads/${pendingThreadId}`);
      }
      return () => {
        setTabBarHidden(false);
      };
    }, [fetchEntries, fetchChapters, fetchThreads, latestChapter?.id, setTabBarHidden])
  );

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setTodayNotifNudgeVisible(false);
        return;
      }
      let cancelled = false;
      void (async () => {
        const [dismissed, osGranted] = await Promise.all([
          isTodayNotificationNudgeDismissed(userId),
          getNotificationPermissionGranted(),
        ]);
        if (cancelled) return;
        const p = useAuthStore.getState().profile;
        const realName =
          !!p?.display_name?.trim() && p.display_name.trim() !== p?.email;
        const profileSaysOn = p?.notification_enabled === true;
        const eligible =
          realName && !dismissed && !(profileSaysOn && osGranted);
        setTodayNotifNudgeVisible(eligible);
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, profile?.display_name, profile?.email, profile?.notification_enabled])
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
      void checkPermission();
    }, [checkPermission])
  );

  useFocusEffect(
    useCallback(() => {
      if (promptType !== "photo") return;
      const canAccess = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!canAccess || photoUri) return;
      let cancelled = false;
      void getRandomAsset().then((photo) => {
        if (cancelled || !photo) return;
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
      });
      return () => {
        cancelled = true;
      };
    }, [promptType, permissionStatus, accessPrivileges, photoUri, getRandomAsset])
  );

  const handleRequestPhotoAccess = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await ensureFullPhotoAccess();
    if (ok) {
      const photo = await getRandomAsset();
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
      }
    }
    await checkPermission();
  }, [ensureFullPhotoAccess, getRandomAsset, checkPermission]);

  const todayPhotoPermissionBlocked =
    promptType === "photo" &&
    !photoUri &&
    !hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);

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
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      analytics?: MomentCaptureAnalytics;
    }) => {
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
        ...entry.analytics,
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
            await fetchEntries(entryId);
          } catch (err) {
            console.error("[TodayScreen] Failed to upload media:", err);
          }
        })();
      }

      await fetchEntries(saved?.id);
      return saved ?? null;
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

  const handleTodayNotifNudgeTurnOn = useCallback(async () => {
    if (!userId) return;
    const granted = await requestNotificationPermissions();
    setNotificationEnabled(granted);
    await supabase
      .from("profiles")
      .update({ notification_enabled: granted })
      .eq("id", userId);
    if (!granted) {
      Alert.alert(
        "Notifications are off",
        "You can enable them later in your phone's Settings when you're ready."
      );
    }
    await dismissTodayNotificationNudge(userId);
    setTodayNotifNudgeVisible(false);
    await fetchProfile();
    await syncPushRegistration({
      notificationsEnabled: granted,
      reminderHour: notificationTime.hour,
      reminderMinute: notificationTime.minute,
    });
    posthog.capture("today_notification_nudge", { choice: "turn_on", granted });
  }, [
    userId,
    setNotificationEnabled,
    notificationTime.hour,
    notificationTime.minute,
    fetchProfile,
    posthog,
  ]);

  const handleTodayNotifNudgeKeepOff = useCallback(async () => {
    if (!userId) return;
    setNotificationEnabled(false);
    await supabase
      .from("profiles")
      .update({ notification_enabled: false })
      .eq("id", userId);
    await dismissTodayNotificationNudge(userId);
    setTodayNotifNudgeVisible(false);
    await fetchProfile();
    await syncPushRegistration({
      notificationsEnabled: false,
      reminderHour: notificationTime.hour,
      reminderMinute: notificationTime.minute,
    });
    posthog.capture("today_notification_nudge", { choice: "keep_off" });
  }, [
    userId,
    setNotificationEnabled,
    notificationTime.hour,
    notificationTime.minute,
    fetchProfile,
    posthog,
  ]);

  const afterSaveNode = useCallback(
    (stats: AfterSaveStats, ctx: AfterSaveContext) => {
      const goCapsule = () => {
        setTabBarHidden(false);
        setJustSaved(false);
        router.push("/(tabs)/memories");
      };
      const goThreads = () => {
        setTabBarHidden(false);
        setJustSaved(false);
        router.push("/threads");
      };
      const goDone = () => {
        setTabBarHidden(false);
        setJustSaved(false);
      };

      const totalDisplayed = stats.totalMoments;
      const streakDisplayed = stats.streakCount;
      const isFreeMilestone10 =
        profile?.subscription_status === "free" &&
        totalDisplayed > 0 &&
        totalDisplayed % 10 === 0;

      const shareButton = (
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
      );

      const doneButton = (
        <Pressable
          onPress={goDone}
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
      );

      return (
        <View>
          <CongratsCard
            headline="Moment saved!"
            totalMoments={totalDisplayed}
            streakCount={streakDisplayed}
            threadsCount={totalConnections}
            onPressMoments={goCapsule}
            onPressThreads={goThreads}
          />
          {isFreeMilestone10 ? (
            <>
              <EllieMessage
                content={`Another 10 moments logged. You're building a real memory archive${firstName ? `, ${firstName}` : ""}! Little Moments Premium might be for you — take a look.`}
              />
              <PremiumInlineCard
                analyticsSource="today_chat_milestone"
                style={{ marginTop: 12, marginBottom: 22 }}
              />
              <EllieMessage content="If not interested now, please continue with your today!" />
              {ctx.savedEntryId ? (
                <SlideToPinMoment entryId={ctx.savedEntryId} />
              ) : null}
              <View style={{ gap: 10, marginTop: 12 }}>
                {shareButton}
                {doneButton}
              </View>
            </>
          ) : (
            <>
              <EllieMessage
                content={`Nice work — that's ${streakDisplayed} day${streakDisplayed !== 1 ? "s" : ""} in a row. Your Capsule is growing. Where to next?`}
              />
              {ctx.savedEntryId ? (
                <SlideToPinMoment entryId={ctx.savedEntryId} />
              ) : null}
              <View style={{ gap: 10, marginTop: 12 }}>
                {shareButton}
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
                {doneButton}
              </View>
            </>
          )}
        </View>
      );
    },
    [
      colors,
      firstName,
      profile?.subscription_status,
      setTabBarHidden,
      totalConnections,
    ]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {fullPhotoAccessModal}
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
        threadsCount={totalConnections}
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

          {__DEV__ && dummyThreadEnabled && (
            <View style={{ marginBottom: 16 }}>
              <ThreadCard
                thread={makeDummyThread()}
                headline="1 New Thread found"
              />
            </View>
          )}
          {todayThreads().map((thread) => (
            <View key={thread.id} style={{ marginBottom: 16 }}>
              <ThreadCard thread={thread} headline="1 New Thread found" />
            </View>
          ))}

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
              initialNumToRender={todayEntries.length}
              windowSize={Math.max(5, todayEntries.length + 2)}
              removeClippedSubviews={false}
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
                const recordCardHeight = (h: number) => {
                  if (h <= 0) return;
                  todayCardHeightsRef.current[item.id] = h;
                  const heights = todayEntries.map(
                    (e) => todayCardHeightsRef.current[e.id] ?? 0
                  );
                  if (heights.some((x) => x <= 0)) return;
                  const maxH = Math.max(...heights);
                  setTodayCarouselMinHeight((prev) =>
                    prev === maxH ? prev : maxH
                  );
                };
                return (
                  <View
                    style={{
                      width: CARD_WIDTH,
                      marginRight: index < todayEntries.length - 1 ? 12 : 0,
                      position: "relative",
                      minHeight: todayCarouselMinHeight,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        posthog.capture("today_entry_tapped", { entry_id: item.id });
                        router.push(`/entry/${item.id}`);
                      }}
                      onLayout={(e) => recordCardHeight(e.nativeEvent.layout.height)}
                      style={{
                        flex: todayCarouselMinHeight ? 1 : undefined,
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
                    <View
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        zIndex: 2,
                      }}
                    >
                      <EntryPinToggle entryId={item.id} />
                    </View>
                  </View>
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

          {showTodayNotifNudge && (
            <View style={{ marginBottom: 12 }}>
              <EllieMessage
                showAvatar
                content="It looks like you might have missed turning on notifications, meaning you'll miss daily reminders. Do you want to turn these on?"
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (todayNotifNudgeIsDevMockOnly) return;
                    void handleTodayNotifNudgeTurnOn();
                  }}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="checkmark" size={18} color="#1A1A1A" />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: "#1A1A1A",
                    }}
                  >
                    Turn on
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (todayNotifNudgeIsDevMockOnly) return;
                    void handleTodayNotifNudgeKeepOff();
                  }}
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 9999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                  <Text
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 14,
                      color: colors.textSecondary,
                    }}
                  >
                    Keep off
                  </Text>
                </Pressable>
              </View>
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
            <PremiumInlineCard analyticsSource="today" style={{ marginTop: 24 }} />
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
            effectivePromptType === "photo" && !todayPhotoPermissionBlocked
              ? handlePhotoShuffle
              : undefined
          }
          photoPermissionBlocked={todayPhotoPermissionBlocked}
          onRequestPhotoAccess={
            todayPhotoPermissionBlocked ? handleRequestPhotoAccess : undefined
          }
          photoAccessButtonLabel={
            permissionStatus === "denied" || accessPrivileges === "limited"
              ? "Open Settings"
              : "Grant photo access"
          }
          ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
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
          analyticsSource="today"
          onAbortFlow={() => {
            setTabBarHidden(false);
            inputMethodRef.current = null;
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
