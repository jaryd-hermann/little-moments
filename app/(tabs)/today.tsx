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
  Image,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { MoreWaysSheet } from "@/components/common/MoreWaysSheet";
import { TryPremiumPill } from "@/components/common/TryPremiumPill";
import * as ImagePicker from "expo-image-picker";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import {
  EllieChatFlow,
  type InputMethod,
  type MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
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
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import {
  hasFullPhotoLibraryAccess,
  useMediaLibrary,
  type PickedPhoto,
} from "@/hooks/useMediaLibrary";
import {
  categorizePhotoBucket,
  photoAgeDays,
  photoYear,
  type PhotoBucket,
} from "@/lib/photoBucket";
import { useDailyPhotoStore } from "@/store/dailyPhotoStore";
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
import { notifyLifecycleEvent } from "@/lib/lifecycleEvent";
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
import { type Entry } from "@/store/entryStore";

const CREAM = "#F7F2E6";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

const HEADER_SHIMMER_WIDTH = 60;
const HEADER_SHIMMER_DELAY_MS = 250;
const HEADER_SHIMMER_DURATION_MS = 950;

function TodayInlineHeader({
  totalMoments,
  showCount,
  shimmerKey,
}: {
  totalMoments: number;
  threadsCount: number;
  showCount: boolean;
  /**
   * Identifier of the most recently saved entry. When this changes to a new,
   * non-null value, the "Nth capture" header fires a one-shot shimmer sweep.
   */
  shimmerKey: string | null;
}) {
  const { colors } = useTheme();

  // Glimmer pulse when totalMoments increases (e.g. just after a save).
  const prevMomentsRef = useRef(totalMoments);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (totalMoments > prevMomentsRef.current) {
      pulse.setValue(0);
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
        }),
        Animated.delay(180),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: false,
        }),
      ]).start();
    }
    prevMomentsRef.current = totalMoments;
  }, [totalMoments, pulse]);

  const animatedColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textMuted, colors.primary],
  });
  const animatedScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  // One-shot shimmer sweep over the title each time we see a new save.
  const [titleWidth, setTitleWidth] = useState(0);
  const shimmerX = useRef(new Animated.Value(-HEADER_SHIMMER_WIDTH)).current;
  const lastShimmeredKey = useRef<string | null>(null);
  useEffect(() => {
    if (!showCount) return;
    if (!shimmerKey) return;
    if (lastShimmeredKey.current === shimmerKey) return;
    if (titleWidth <= 0) return;
    lastShimmeredKey.current = shimmerKey;
    shimmerX.setValue(-HEADER_SHIMMER_WIDTH);
    const anim = Animated.sequence([
      Animated.delay(HEADER_SHIMMER_DELAY_MS),
      Animated.timing(shimmerX, {
        toValue: titleWidth + HEADER_SHIMMER_WIDTH,
        duration: HEADER_SHIMMER_DURATION_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [showCount, shimmerKey, titleWidth, shimmerX]);

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingTop: 2,
        paddingBottom: 8,
      }}
    >
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (w !== titleWidth) setTitleWidth(w);
        }}
        style={{
          flexShrink: 1,
          paddingHorizontal: 4,
          overflow: "hidden",
        }}
      >
        <Animated.Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: showCount ? animatedColor : colors.text,
            transform: [{ scale: showCount ? animatedScale : 1 }],
          }}
        >
          {showCount
            ? `${ordinal(Math.max(1, totalMoments))} capture`
            : "Capture this"}
        </Animated.Text>
        {showCount && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: HEADER_SHIMMER_WIDTH,
              transform: [{ translateX: shimmerX }, { skewX: "-20deg" }],
            }}
          >
            <LinearGradient
              colors={[
                "rgba(255,255,255,0)",
                "rgba(255,255,255,0.55)",
                "rgba(255,255,255,0)",
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TryPremiumPill source="today_header" />
        <Pressable
          onPress={() => router.push("/settings")}
          accessibilityLabel="Open settings"
          hitSlop={8}
          style={{
            width: 28,
            height: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="menu" size={20} color={colors.icon} />
        </Pressable>
      </View>
    </View>
  );
}

export default function TodayScreen() {
  const { colors, theme } = useTheme();
  const { profile, fetchProfile } = useAuth();
  const setNotificationEnabled = useSettingsStore((s) => s.setNotificationEnabled);
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const posthog = usePostHog();
  const { entries, fetchEntries, saveEntry } = useEntries();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { streakCount, totalMoments } = useStreak();
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
  const { todayThreads, fetchAll: fetchThreads, totalConnections } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);
  const dummyNotificationNudgeEnabled = useTodayNotifDevStore(
    (s) => s.dummyNotificationNudgeEnabled
  );

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [photoBucket, setPhotoBucket] = useState<PhotoBucket | undefined>();
  const [shuffleCount, setShuffleCount] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  /** When true, render EllieChatFlow even though there's already a moment for today. Reset after save. */
  const [inCaptureMode, setInCaptureMode] = useState(false);
  const { capture: captureParam } = useLocalSearchParams<{ capture?: string }>();
  const inputMethodRef = useRef<InputMethod | null>(null);
  const postSaveOpacity = useRef(new Animated.Value(1)).current;

  const savedEntry: Entry | null = useMemo(
    () => (lastSavedEntryId ? entries.find((e) => e.id === lastSavedEntryId) ?? null : null),
    [entries, lastSavedEntryId]
  );

  const dailyPrompt = useMemo(() => getDailyPrompt(), []);
  const promptType: PromptType = "photo";
  const [moreWaysVisible, setMoreWaysVisible] = useState(false);

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
      fetchThreads();
      setLastSavedEntryId(null);
      setShareModalVisible(false);
      setJustSaved(false);
      inputMethodRef.current = null;
      return () => {
        setTabBarHidden(false);
      };
    }, [fetchEntries, fetchThreads, setTabBarHidden])
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

  // Honor a ?capture=1 query param: when arriving from end-of-feed in Capsule,
  // open Capture in capture-another mode if today's moment already exists.
  useEffect(() => {
    if (captureParam === "1") {
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setShuffleCount(0);
      setLastSavedEntryId(null);
      inputMethodRef.current = null;
      setInCaptureMode(true);
      router.setParams({ capture: undefined });
    }
  }, [captureParam]);

  /**
   * Apply a picked photo to the prompt UI and emit `photo_shown`. Use for
   * every code path that sets `photoUri` from the random picker, the system
   * picker, or a deep link, so the analytics stay in sync.
   *
   * `persist` controls whether this pick should also become the persisted
   * "photo of the day". Fresh picks (initial / shuffle / manual_pick /
   * permission_grant) all persist; rehydrating from disk does not.
   */
  const applyPickedPhoto = useCallback(
    (
      photo: PickedPhoto,
      reason:
        | "initial"
        | "shuffle"
        | "permission_grant"
        | "manual_pick"
        | "rehydrate",
      options?: { persist?: boolean }
    ) => {
      setPhotoUri(photo.asset.uri);
      setPhotoDate(photo.asset.creationTime);
      setPhotoBucket(photo.bucket);
      // Default: every reason except "rehydrate" persists. Rehydration
      // already came from disk and re-writing would be a no-op.
      const shouldPersist = options?.persist ?? reason !== "rehydrate";
      if (shouldPersist) {
        const dateKey = format(new Date(), "yyyy-MM-dd");
        useDailyPhotoStore
          .getState()
          .setDailyPhoto(userId ?? "", dateKey, photo);
      }
      // Don't double-emit `photo_shown` on rehydrate — the user already
      // saw this exact photo earlier in the day.
      if (reason !== "rehydrate") {
        posthog.capture("photo_shown", {
          surface: "today",
          reason,
          photo_bucket: photo.bucket,
          photo_age_days: photoAgeDays(photo.asset.creationTime),
          photo_year: photoYear(photo.asset.creationTime),
          selection_path: photo.selectionPath,
          shuffles_so_far: shuffleCount,
        });
      }
    },
    [posthog, shuffleCount, userId]
  );

  useFocusEffect(
    useCallback(() => {
      if (promptType !== "photo") return;
      const canAccess = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!canAccess || photoUri) return;
      let cancelled = false;
      void (async () => {
        const dateKey = format(new Date(), "yyyy-MM-dd");
        const stored = useDailyPhotoStore
          .getState()
          .getDailyPhoto(userId ?? "", dateKey);
        if (stored) {
          if (cancelled) return;
          applyPickedPhoto(stored, "rehydrate");
          return;
        }
        const photo = await getRandomAsset();
        if (cancelled || !photo) return;
        applyPickedPhoto(photo, "initial");
      })();
      return () => {
        cancelled = true;
      };
    }, [
      promptType,
      permissionStatus,
      accessPrivileges,
      photoUri,
      getRandomAsset,
      applyPickedPhoto,
      userId,
    ])
  );

  const handleRequestPhotoAccess = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("home_photo_nudge_tapped", {
      action: "allow",
      surface: "today",
    });
    const ok = await ensureFullPhotoAccess();
    posthog.capture("home_photo_nudge_resolved", {
      result: ok ? "granted" : "dismissed",
      surface: "today",
    });
    if (ok) {
      const photo = await getRandomAsset();
      if (photo) {
        applyPickedPhoto(photo, "permission_grant");
      }
    }
    await checkPermission();
  }, [
    ensureFullPhotoAccess,
    getRandomAsset,
    checkPermission,
    posthog,
    applyPickedPhoto,
  ]);

  const todayPhotoPermissionBlocked =
    promptType === "photo" &&
    !photoUri &&
    !hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);

  // Fire once per blocked-state transition so we can measure long-tail permission
  // acquisition for users who skipped during onboarding.
  const photoNudgeShownRef = useRef(false);
  useEffect(() => {
    if (todayPhotoPermissionBlocked && !photoNudgeShownRef.current) {
      photoNudgeShownRef.current = true;
      posthog.capture("home_photo_nudge_shown", { surface: "today" });
    } else if (!todayPhotoPermissionBlocked) {
      photoNudgeShownRef.current = false;
    }
  }, [todayPhotoPermissionBlocked, posthog]);

  const handlePhotoShuffle = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsShuffling(true);
    setShuffleCount((c) => c + 1);
    posthog.capture("photo_shuffled", {
      surface: "today",
      from_photo_bucket: photoBucket ?? null,
      from_photo_age_days: photoDate != null ? photoAgeDays(photoDate) : null,
      shuffles_so_far: shuffleCount + 1,
    });
    try {
      const photo = await getRandomAsset();
      if (photo) {
        applyPickedPhoto(photo, "shuffle");
      }
    } finally {
      setIsShuffling(false);
    }
  }, [
    getRandomAsset,
    posthog,
    photoBucket,
    photoDate,
    shuffleCount,
    applyPickedPhoto,
  ]);

  const handleMoreWaysGiveWord = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/capture/word");
  }, []);

  const handleMoreWaysJustWrite = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/capture/freetext");
  }, []);

  const handleMoreWaysDifferentPhoto = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await ensureFullPhotoAccess();
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
      exif: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const ts = (asset.exif?.DateTimeOriginal || asset.exif?.DateTime) as
      | string
      | undefined;
    let creationTime = Date.now();
    if (ts) {
      const parsed = Date.parse(ts.replace(":", "-").replace(":", "-"));
      if (!Number.isNaN(parsed)) creationTime = parsed;
    }
    const bucket = categorizePhotoBucket(creationTime);
    applyPickedPhoto(
      {
        asset: {
          id: asset.assetId ?? asset.uri,
          uri: asset.uri,
          creationTime,
          mediaType: "photo",
          width: asset.width ?? 0,
          height: asset.height ?? 0,
        },
        bucket,
        selectionPath: "query_fallback",
      },
      "manual_pick"
    );
  }, [ensureFullPhotoAccess, applyPickedPhoto]);

  const handleComplete = useCallback(
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      attachedPhotoTakenAtMs?: number;
      analytics?: MomentCaptureAnalytics;
    }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const photoBucketAtSave = entry.attachedPhotoTakenAtMs
        ? categorizePhotoBucket(entry.attachedPhotoTakenAtMs)
        : null;
      const photoAgeDaysAtSave =
        entry.attachedPhotoTakenAtMs != null
          ? photoAgeDays(entry.attachedPhotoTakenAtMs)
          : null;
      const saved = await saveEntry({
        title: entry.title,
        body: entry.body,
        entry_type: "moment",
        entry_date: today,
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: null,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: null,
        chapter_id: null,
        photo_bucket_at_save: photoBucketAtSave,
        photo_age_days_at_save: photoAgeDaysAtSave,
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
        const takenAtIso = entry.attachedPhotoTakenAtMs
          ? new Date(entry.attachedPhotoTakenAtMs).toISOString()
          : null;
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
              taken_at: takenAtIso,
            });
            console.log("[TodayScreen] Photo uploaded and linked");
            await fetchEntries(entryId);
            // Fire the rich success push only AFTER the entry_media row
            // is in place — the lifecycle handler reads `storage_url` to
            // populate the OneSignal `ios_attachments` / `big_picture`
            // image. Sending earlier would leave it without an image
            // since the local `file://` URI isn't reachable by the NSE.
            void notifyLifecycleEvent("moment_saved", { entry_id: entryId });
          } catch (err) {
            console.error("[TodayScreen] Failed to upload media:", err);
          }
        })();
      } else if (saved?.id) {
        // Text-only save — no media to wait for.
        void notifyLifecycleEvent("moment_saved", { entry_id: saved.id });
      }

      await fetchEntries(saved?.id);

      // Animated transition back to the post-save Capture view: fade in + success haptic.
      setInCaptureMode(false);
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setShuffleCount(0);
      setTabBarHidden(false);
      postSaveOpacity.setValue(0);
      Animated.timing(postSaveOpacity, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Spin + glimmer the Capsule tab icon to celebrate the save.
      useTabBarStore.getState().pulseCapsule();
      // Note: the celebratory "You captured your Nth moment" push is fired
      // by `notifyLifecycleEvent("moment_saved", ...)` above — for photo
      // saves it waits until the upload completes so the OneSignal payload
      // can ship the public storage URL as the rich image. Text-only
      // saves fire it inline (no media to wait for).

      return saved ?? null;
    },
    [saveEntry, promptType, posthog, userId, fetchEntries, postSaveOpacity, setTabBarHidden]
  );

  const effectivePromptType: PromptType = promptType;
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
        router.push("/(tabs)/brain");
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
          <Ionicons name="heart-outline" size={18} color={PINK_CTA_INK} />
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: PINK_CTA_INK,
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
      <TodayInlineHeader
        totalMoments={totalMoments}
        threadsCount={totalConnections}
        showCount={!!todayEntry && !inCaptureMode}
        shimmerKey={lastSavedEntryId}
      />

      {todayEntry && !inCaptureMode ? (
        <Animated.ScrollView
          style={{ flex: 1, opacity: postSaveOpacity }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >

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
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        overflow: "hidden",
                      }}
                    >
                      {media && (
                        <EntryMediaImage
                          media={media}
                          style={{
                            width: "100%",
                            aspectRatio: 1,
                          }}
                        />
                      )}
                      <View style={{ padding: 16 }}>
                        {item.title && (
                          <Text
                            style={{
                              fontFamily: "LibreBaskerville-Bold",
                              fontSize: 16,
                              color: colors.text,
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
                            color: colors.textSecondary,
                          }}
                          numberOfLines={media ? 2 : 4}
                          ellipsizeMode="tail"
                        >
                          {item.body}
                        </Text>
                        {item.word_of_day && (
                          <View
                            style={{
                              marginTop: 10,
                              alignSelf: "flex-start",
                              borderRadius: 8,
                              backgroundColor: colors.surfaceSecondary,
                              paddingHorizontal: 10,
                              paddingVertical: 4,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Roboto-Regular",
                                fontSize: 12,
                                color: colors.textMuted,
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
                  <Ionicons name="checkmark" size={18} color={PINK_CTA_INK} />
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 14,
                      color: PINK_CTA_INK,
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

          {/* Capture Another — defaults to a fresh photo prompt; More Ways only via the pill */}
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // Drop the persisted daily-photo cache so the focus effect
              // picks a fresh asset for this second capture instead of
              // rehydrating the one the user just used. Without this,
              // useFocusEffect immediately re-applies the cached photo
              // and "Capture another" reproduces the same prompt.
              const dateKey = format(new Date(), "yyyy-MM-dd");
              useDailyPhotoStore
                .getState()
                .clearDailyPhoto(userId ?? "", dateKey);
              setPhotoUri(undefined);
              setPhotoDate(undefined);
              setShuffleCount(0);
              setLastSavedEntryId(null);
              inputMethodRef.current = null;
              setInCaptureMode(true);
            }}
            style={{
              height: 56,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              marginBottom: 12,
              ...bevelShadow(theme),
            }}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={PINK_CTA_INK}
            />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Capture another
            </Text>
          </Pressable>

          {/* Dig Deeper with Ellie — opens dig deeper modal for the latest entry */}
          {todayEntry && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/dig-deeper",
                  params: {
                    entryId: todayEntry.id,
                    title: todayEntry.title ?? "",
                    body: todayEntry.body ?? "",
                    photoUri: todayEntry.media?.[0]?.storage_url ?? "",
                  },
                });
              }}
              style={{
                height: 52,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.text,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <Image
                source={
                  theme === "dark"
                    ? require("@/assets/images/white-icon.png")
                    : require("@/assets/images/icon.png")
                }
                style={{ width: 24, height: 24, borderRadius: 6 }}
              />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: colors.text,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Dig deeper
              </Text>
            </Pressable>
          )}

          {/* Share — small text link */}
          <Pressable
            onPress={() => {
              if (todayEntry) {
                setLastSavedEntryId(todayEntry.id);
                setShareModalVisible(true);
              }
            }}
            style={{
              alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="arrow-up" size={14} color={colors.textSecondary} style={{ transform: [{ rotate: "45deg" }] }} />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 14,
                  color: colors.textSecondary,
                }}
              >
                Share
              </Text>
            </View>
          </Pressable>

        </Animated.ScrollView>
      ) : (
        <EllieChatFlow
          promptType={effectivePromptType}
          promptValue={effectivePromptValue}
          photoUri={photoUri}
          photoDate={photoDate}
          photoBucket={photoBucket}
          shufflesBeforeSave={shuffleCount}
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
              ? "OPEN SETTINGS"
              : "CONTINUE"
          }
          onPhotoAccessWordFallback={
            todayPhotoPermissionBlocked
              ? () => {
                  posthog.capture("home_photo_nudge_tapped", {
                    action: "word_fallback",
                    surface: "today",
                  });
                  router.push("/capture/word");
                }
              : undefined
          }
          ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
          afterSaveNode={afterSaveNode}
          welcomeMessages={[]}
          extraGuidance={undefined}
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
          onMoreWaysPress={() => setMoreWaysVisible(true)}
          skipPreview
        />
      )}

      <MoreWaysSheet
        visible={moreWaysVisible}
        onClose={() => setMoreWaysVisible(false)}
        onGiveWord={handleMoreWaysGiveWord}
        onJustWrite={handleMoreWaysJustWrite}
        onUseDifferentPhoto={handleMoreWaysDifferentPhoto}
      />

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />

    </SafeAreaView>
  );
}
