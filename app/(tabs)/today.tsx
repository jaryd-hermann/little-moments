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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format, subDays } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { TryPremiumPill } from "@/components/common/TryPremiumPill";
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
  queryCameraPhotosForLocalDay,
  useMediaLibrary,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import {
  categorizePhotoBucket,
  photoAgeDays,
  type PhotoBucket,
} from "@/lib/photoBucket";
import { CaptureBrowseHeading } from "@/components/capture/CaptureBrowseHeading";
import { CuratorBrowsePanel } from "@/components/capture/CuratorBrowsePanel";
import {
  CaptureDayPickerSheet,
  type DayPickerRow,
} from "@/components/capture/CaptureDayPickerSheet";
import {
  calendarDateForReflectionTarget,
  captureScreenHeading,
  defaultReflectionTarget,
} from "@/lib/reflectionTarget";
import type { ReflectionQuestionItem } from "@/lib/captureReflectionQuestions";
import { REFLECTION_QUESTIONS } from "@/lib/captureReflectionQuestions";
import { useThreadDevStore, makeDummyThread } from "@/store/threadDevStore";
import { useTodayNotifDevStore } from "@/store/todayNotifDevStore";
import { useThreads } from "@/hooks/useThreads";
import { ThreadCard } from "@/components/threads/ThreadCard";
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
import { useFirstMomentOnboardingSheetStore } from "@/store/firstMomentOnboardingSheetStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import type { PromptType } from "@/lib/momentAssist";
import { type Entry } from "@/store/entryStore";

const CREAM = "#F7F2E6";

const WORDMARK_LIGHT_ON_DARK = require("@/assets/images/wordmark-little-moments.png");
const WORDMARK_DARK_ON_LIGHT = require("@/assets/images/wordmark-little-moments-black.png");

function CaptureTabTopBar({ showPremium }: { showPremium: boolean }) {
  const { colors, theme } = useTheme();
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
      <Image
        source={
          theme === "dark" ? WORDMARK_LIGHT_ON_DARK : WORDMARK_DARK_ON_LIGHT
        }
        style={{
          width: 138,
          height: 27,
          resizeMode: "contain",
          marginLeft: -10,
        }}
        accessibilityLabel="Little Moments"
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {showPremium ? <TryPremiumPill source="today_header" /> : null}
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
  const momentCount = useMemo(
    () => entries.filter((e) => e.entry_type === "moment").length,
    [entries]
  );
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { streakCount } = useStreak();
  const {
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
  const [pinnedQuestion, setPinnedQuestion] =
    useState<ReflectionQuestionItem | null>(null);
  const [questionAutoStart, setQuestionAutoStart] = useState<
    "speaking" | "typing" | null
  >(null);
  const [dayPhotos, setDayPhotos] = useState<MediaAsset[]>([]);
  const [loadingDayPhotos, setLoadingDayPhotos] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [dayPickerSkipFilledDays, setDayPickerSkipFilledDays] = useState(false);
  const [dayPickerPhotoCounts, setDayPickerPhotoCounts] = useState<
    Record<string, number>
  >({});
  const [questionBrowseNonce, setQuestionBrowseNonce] = useState(0);
  const [wantsNewMoment, setWantsNewMoment] = useState(false);
  const captureDateInitializedRef = useRef(false);
  const [captureTargetDate, setCaptureTargetDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const { capture: captureParam, onboardingFirstMoment: onboardingFirstMomentParam, openCamera: openCameraParam } =
    useLocalSearchParams<{
      capture?: string;
      onboardingFirstMoment?: string;
      openCamera?: string;
    }>();
  const inputMethodRef = useRef<InputMethod | null>(null);
  const expectOnboardingFirstCaptureRef = useRef(false);
  const [awaitingFirstOnboardingCapture, setAwaitingFirstOnboardingCapture] =
    useState(false);
  const postSaveOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (momentCount > 0) setAwaitingFirstOnboardingCapture(false);
  }, [momentCount]);

  const savedEntry: Entry | null = useMemo(
    () => (lastSavedEntryId ? entries.find((e) => e.id === lastSavedEntryId) ?? null : null),
    [entries, lastSavedEntryId]
  );

  const targetDayYmd = useMemo(
    () => format(captureTargetDate, "yyyy-MM-dd"),
    [captureTargetDate]
  );

  const captureHeading = useMemo(
    () => captureScreenHeading(captureTargetDate),
    [captureTargetDate]
  );

  useEffect(() => {
    if (!profile || captureDateInitializedRef.current) return;
    captureDateInitializedRef.current = true;
    setCaptureTargetDate(
      calendarDateForReflectionTarget(defaultReflectionTarget(profile))
    );
  }, [profile]);

  const targetDayEntries: Entry[] = useMemo(
    () =>
      entries.filter(
        (e) => e.entry_date === targetDayYmd && e.entry_type === "moment"
      ),
    [entries, targetDayYmd]
  );

  const isPinnedForEllie =
    pinnedQuestion != null || (photoUri != null && photoDate != null);

  const showHome =
    !isPinnedForEllie && targetDayEntries.length > 0 && !wantsNewMoment;

  const showBrowse =
    !isPinnedForEllie && (wantsNewMoment || targetDayEntries.length === 0);

  const targetDayEntriesLayoutKey = useMemo(
    () => targetDayEntries.map((e) => e.id).join(","),
    [targetDayEntries]
  );
  const todayCardHeightsRef = useRef<Record<string, number>>({});
  const [todayCarouselMinHeight, setTodayCarouselMinHeight] = useState<
    number | undefined
  >(undefined);


  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = screenWidth - 40;
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [todayNotifNudgeVisible, setTodayNotifNudgeVisible] = useState(false);
  const showTodayNotifNudge =
    todayNotifNudgeVisible || (__DEV__ && dummyNotificationNudgeEnabled);
  const todayNotifNudgeIsDevMockOnly =
    __DEV__ && dummyNotificationNudgeEnabled && !todayNotifNudgeVisible;

  const promptType: PromptType = pinnedQuestion ? "question" : "photo";
  const effectivePromptValue = pinnedQuestion ? pinnedQuestion.prompt : "";

  const elliePhotoEnterOpacity = useRef(new Animated.Value(1)).current;
  const capturePhotoEllieEnteredRef = useRef(false);

  useEffect(() => {
    if (!isPinnedForEllie) {
      capturePhotoEllieEnteredRef.current = false;
      elliePhotoEnterOpacity.setValue(1);
      return;
    }
    if (promptType !== "photo") {
      elliePhotoEnterOpacity.setValue(1);
      capturePhotoEllieEnteredRef.current = true;
      return;
    }
    if (capturePhotoEllieEnteredRef.current) return;
    capturePhotoEllieEnteredRef.current = true;
    elliePhotoEnterOpacity.setValue(0);
    const timeouts = [
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 90),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 270),
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 480),
    ];
    Animated.timing(elliePhotoEnterOpacity, {
      toValue: 1,
      duration: 680,
      useNativeDriver: true,
    }).start();
    return () => {
      for (const t of timeouts) clearTimeout(t);
    };
  }, [isPinnedForEllie, promptType, elliePhotoEnterOpacity]);

  useEffect(() => {
    todayCardHeightsRef.current = {};
    setTodayCarouselMinHeight(undefined);
  }, [targetDayEntriesLayoutKey]);

  /** Carousel-visible moment on the success home (Share / Dig deeper). */
  const successHighlightEntry = useMemo(() => {
    if (targetDayEntries.length === 0) return null;
    const idx = Math.min(
      Math.max(0, activeCardIndex),
      targetDayEntries.length - 1
    );
    return targetDayEntries[idx] ?? null;
  }, [targetDayEntries, activeCardIndex]);

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
      posthog.capture("viewed_today", {
        target_ymd: targetDayYmd,
        has_moment_for_target: targetDayEntries.length > 0,
        entry_count_for_target: targetDayEntries.length,
      });
    }, [targetDayYmd, targetDayEntries.length, posthog])
  );

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );

  const clearPinState = useCallback(() => {
    setPhotoUri(undefined);
    setPhotoDate(undefined);
    setPhotoBucket(undefined);
    setPinnedQuestion(null);
    setShuffleCount(0);
    setQuestionAutoStart(null);
    inputMethodRef.current = null;
  }, []);

  const handleReturnToPhotoPicker = useCallback(() => {
    clearPinState();
    setTabBarHidden(false);
    setWantsNewMoment(true);
  }, [clearPinState, setTabBarHidden]);

  const handleUsePromptInsteadFromPhoto = useCallback(() => {
    clearPinState();
    setTabBarHidden(false);
    setWantsNewMoment(true);
    setQuestionBrowseNonce((n) => n + 1);
  }, [clearPinState, setTabBarHidden]);

  useEffect(() => {
    if (captureParam !== "1" && onboardingFirstMomentParam !== "1") return;

    if (captureParam === "1") {
      clearPinState();
      setLastSavedEntryId(null);
      setWantsNewMoment(true);
    }
    if (onboardingFirstMomentParam === "1") {
      expectOnboardingFirstCaptureRef.current = true;
      setAwaitingFirstOnboardingCapture(true);
    }

    router.setParams({
      ...(captureParam === "1" ? { capture: undefined } : {}),
      ...(onboardingFirstMomentParam === "1"
        ? { onboardingFirstMoment: undefined }
        : {}),
    });
  }, [captureParam, onboardingFirstMomentParam, clearPinState]);

  useEffect(() => {
    if (openCameraParam !== "1") return;
    router.setParams({ openCamera: undefined });
    let cancelled = false;
    void (async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (cancelled || status !== "granted") return;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (cancelled || result.canceled || !result.assets[0]?.uri) return;
      const asset = result.assets[0];
      clearPinState();
      setLastSavedEntryId(null);
      setWantsNewMoment(true);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      const taken = Date.now();
      setPhotoUri(asset.uri);
      setPhotoDate(taken);
      setPhotoBucket(categorizePhotoBucket(taken));
    })();
    return () => {
      cancelled = true;
    };
  }, [openCameraParam, clearPinState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const can = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!can) {
        if (!cancelled) {
          setDayPhotos([]);
          setLoadingDayPhotos(false);
        }
        return;
      }
      setLoadingDayPhotos(true);
      try {
        const list = await queryCameraPhotosForLocalDay(captureTargetDate);
        if (!cancelled) {
          setDayPhotos(list);
          posthog.capture("photo_carousel_viewed", {
            target_ymd: targetDayYmd,
            photo_count: list.length,
          });
        }
      } finally {
        if (!cancelled) setLoadingDayPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    captureTargetDate,
    permissionStatus,
    accessPrivileges,
    targetDayYmd,
    posthog,
  ]);

  useEffect(() => {
    if (!dayPickerOpen) return;
    const can = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
    if (!can) {
      setDayPickerPhotoCounts({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 21; i++) {
        if (cancelled) return;
        const d = subDays(new Date(), i);
        const ymd = format(d, "yyyy-MM-dd");
        const photos = await queryCameraPhotosForLocalDay(d);
        counts[ymd] = photos.length;
      }
      if (!cancelled) setDayPickerPhotoCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
  }, [dayPickerOpen, permissionStatus, accessPrivileges]);

  const handlePinPhotoFromBrowse = useCallback(
    (asset: MediaAsset) => {
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      setPhotoUri(asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setShuffleCount(0);
      posthog.capture("photo_pinned", {
        target_ymd: targetDayYmd,
        photo_bucket: bucket,
        photo_age_days: photoAgeDays(asset.creationTime),
      });
    },
    [posthog, targetDayYmd]
  );

  const handleStartQuestionFromBrowse = useCallback(
    (q: ReflectionQuestionItem, method: "speaking" | "typing") => {
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setPinnedQuestion(q);
      setShuffleCount(0);
      setQuestionAutoStart(method);
      posthog.capture("question_pinned", {
        target_ymd: targetDayYmd,
        question_id: q.id,
        input_method: method,
      });
    },
    [posthog, targetDayYmd]
  );

  const defaultDayYmd = useMemo(
    () =>
      format(
        calendarDateForReflectionTarget(defaultReflectionTarget(profile)),
        "yyyy-MM-dd"
      ),
    [profile]
  );

  const dayPickerRows: DayPickerRow[] = useMemo(() => {
    const momentDates = new Set(
      entries
        .filter((e) => e.entry_type === "moment" && e.entry_date)
        .map((e) => e.entry_date as string)
    );
    const rows: DayPickerRow[] = [];
    for (let i = 0; i < 21; i++) {
      const d = subDays(new Date(), i);
      const ymd = format(d, "yyyy-MM-dd");
      const isToday = i === 0;
      rows.push({
        ymd,
        titleLine: isToday
          ? "Today"
          : i === 1
            ? "Yesterday"
            : format(d, "EEEE"),
        subtitle: format(d, "MMM d, yyyy"),
        hasMoment: momentDates.has(ymd),
        isDefaultRow: ymd === defaultDayYmd,
        photoCount: dayPickerPhotoCounts[ymd] ?? null,
      });
    }
    return rows;
  }, [entries, defaultDayYmd, dayPickerPhotoCounts]);

  const handleSelectDayFromPicker = useCallback(
    (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      setCaptureTargetDate(new Date(y, m - 1, d));
      clearPinState();
      setLastSavedEntryId(null);
      const hasMomentForDay = entries.some(
        (e) => e.entry_type === "moment" && e.entry_date === ymd
      );
      setWantsNewMoment(!hasMomentForDay);
      posthog.capture("capture_day_selected", { ymd, had_moment: hasMomentForDay });
    },
    [clearPinState, posthog, entries]
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
    await checkPermission();
  }, [ensureFullPhotoAccess, checkPermission, posthog]);

  const todayPhotoPermissionBlocked =
    promptType === "photo" &&
    !photoUri &&
    !hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);

  const photoNudgeShownRef = useRef(false);
  useEffect(() => {
    if (todayPhotoPermissionBlocked && !photoNudgeShownRef.current) {
      photoNudgeShownRef.current = true;
      posthog.capture("home_photo_nudge_shown", { surface: "today" });
    } else if (!todayPhotoPermissionBlocked) {
      photoNudgeShownRef.current = false;
    }
  }, [todayPhotoPermissionBlocked, posthog]);

  const handleComplete = useCallback(
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      attachedPhotoTakenAtMs?: number;
      analytics?: MomentCaptureAnalytics;
    }) => {
      const memoryYmd = format(captureTargetDate, "yyyy-MM-dd");
      const mem = captureTargetDate;
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
        entry_date: memoryYmd,
        entry_month: mem.getMonth() + 1,
        entry_year: mem.getFullYear(),
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
      setWantsNewMoment(false);
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setPinnedQuestion(null);
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

      if (expectOnboardingFirstCaptureRef.current && saved?.id) {
        expectOnboardingFirstCaptureRef.current = false;
        setAwaitingFirstOnboardingCapture(false);
        useFirstMomentOnboardingSheetStore.getState().show(saved.id);
      }

      return saved ?? null;
    },
    [
      saveEntry,
      promptType,
      posthog,
      userId,
      fetchEntries,
      postSaveOpacity,
      setTabBarHidden,
      captureTargetDate,
    ]
  );

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
      reflectionTargetDefault: profile?.reflection_target_default ?? undefined,
      captureRhythm:
        profile?.capture_rhythm === "morning" ||
        profile?.capture_rhythm === "evening"
          ? profile.capture_rhythm
          : undefined,
    });
    posthog.capture("today_notification_nudge", { choice: "turn_on", granted });
  }, [
    userId,
    setNotificationEnabled,
    notificationTime.hour,
    notificationTime.minute,
    fetchProfile,
    posthog,
    profile?.reflection_target_default,
    profile?.capture_rhythm,
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
      reflectionTargetDefault: profile?.reflection_target_default ?? undefined,
      captureRhythm:
        profile?.capture_rhythm === "morning" ||
        profile?.capture_rhythm === "evening"
          ? profile.capture_rhythm
          : undefined,
    });
    posthog.capture("today_notification_nudge", { choice: "keep_off" });
  }, [
    userId,
    setNotificationEnabled,
    notificationTime.hour,
    notificationTime.minute,
    fetchProfile,
    posthog,
    profile?.reflection_target_default,
    profile?.capture_rhythm,
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
      <CaptureTabTopBar showPremium={momentCount > 0} />

      {showHome ? (
        <Animated.ScrollView
          style={{ flex: 1, opacity: postSaveOpacity }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginHorizontal: -20, marginBottom: 8 }}>
            <CaptureBrowseHeading
              upperLabel="YOU CAPTURED"
              title={captureHeading.title}
              onPressChangeDay={() => {
                setDayPickerSkipFilledDays(false);
                setDayPickerOpen(true);
              }}
            />
          </View>

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
              data={targetDayEntries}
              keyExtractor={(item) => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              snapToInterval={CARD_WIDTH + 12}
              decelerationRate="fast"
              initialNumToRender={targetDayEntries.length}
              windowSize={Math.max(5, targetDayEntries.length + 2)}
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
                  const heights = targetDayEntries.map(
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
                      marginRight: index < targetDayEntries.length - 1 ? 12 : 0,
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
                        top: 12,
                        right: 12,
                        zIndex: 2,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <EntryPinToggle entryId={item.id} size={20} />
                      <Pressable
                        onPress={() => {
                          void Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light
                          );
                          setLastSavedEntryId(item.id);
                          setShareModalVisible(true);
                        }}
                        hitSlop={10}
                        accessibilityLabel="Share moment"
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          borderWidth: 1,
                          borderColor: "rgba(0,0,0,0.14)",
                          backgroundColor: "#FFFFFF",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name="share-outline"
                          size={18}
                          color="#000000"
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
            {targetDayEntries.length > 1 && (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {targetDayEntries.map((_, i) => (
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
              posthog.capture("capture_another_open_day_picker", {
                from_ymd: targetDayYmd,
              });
              setDayPickerSkipFilledDays(true);
              setDayPickerOpen(true);
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

          {/* Dig Deeper with Ellie — opens dig deeper modal for the visible carousel moment */}
          {successHighlightEntry && (
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/dig-deeper",
                  params: {
                    entryId: successHighlightEntry.id,
                    title: successHighlightEntry.title ?? "",
                    body: successHighlightEntry.body ?? "",
                    photoUri:
                      successHighlightEntry.media?.[0]?.storage_url ?? "",
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

        </Animated.ScrollView>
      ) : isPinnedForEllie ? (
        <Animated.View style={{ flex: 1, opacity: elliePhotoEnterOpacity }}>
        <EllieChatFlow
          promptType={promptType}
          promptValue={effectivePromptValue}
          photoUri={photoUri}
          photoDate={photoDate}
          photoBucket={photoBucket}
          shufflesBeforeSave={shuffleCount}
          isShufflingPhoto={false}
          keyboardAvoidingExtraOffset={48}
          onComplete={handleComplete}
          onPhotoShuffle={
            promptType === "photo" ? handleReturnToPhotoPicker : undefined
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
              prompt_type: promptType,
              input_method: inputMethod,
            });
            setTabBarHidden(true);
          }}
          analyticsSource="today"
          hideTimerHint={promptType === "photo"}
          promptAccent={pinnedQuestion?.promptAccent}
          questionOrdinal={
            pinnedQuestion
              ? {
                  current:
                    REFLECTION_QUESTIONS.findIndex(
                      (q) => q.id === pinnedQuestion.id
                    ) + 1,
                  total: REFLECTION_QUESTIONS.length,
                }
              : undefined
          }
          headerNode={
            <View style={{ marginHorizontal: -20 }}>
              <CaptureBrowseHeading
                title={captureHeading.title}
                onPressChangeDay={() => {
                  setDayPickerSkipFilledDays(false);
                  setDayPickerOpen(true);
                }}
                titleAccessory={
                  promptType === "photo" ? (
                    <Pressable
                      onPress={handleUsePromptInsteadFromPhoto}
                      hitSlop={8}
                    >
                      <Text
                        style={{
                          fontFamily: "Roboto-Medium",
                          fontSize: 14,
                          color: colors.textSecondary,
                        }}
                      >
                        Do a prompt instead
                      </Text>
                    </Pressable>
                  ) : undefined
                }
              />
            </View>
          }
          autoStartInputMethod={
            pinnedQuestion && questionAutoStart
              ? questionAutoStart
              : undefined
          }
          onAbortFlow={() => {
            clearPinState();
            setTabBarHidden(false);
          }}
          skipPreview
        />
        </Animated.View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          <CuratorBrowsePanel
            key={targetDayYmd}
            headingTitle={captureHeading.title}
            onPressChangeDay={() => {
              setDayPickerSkipFilledDays(false);
              setDayPickerOpen(true);
            }}
            dayPhotos={dayPhotos}
            loadingPhotos={loadingDayPhotos}
            onChoosePhoto={handlePinPhotoFromBrowse}
            onStartQuestionCapture={handleStartQuestionFromBrowse}
            forceQuestionModeNonce={questionBrowseNonce}
            ellieNoPhotosFirstCapture={
              awaitingFirstOnboardingCapture &&
              !loadingDayPhotos &&
              dayPhotos.length === 0
            }
            analyticsContext={{
              target_ymd: targetDayYmd,
              surface: "today",
            }}
          />
        </ScrollView>
      )}

      <CaptureDayPickerSheet
        visible={dayPickerOpen}
        onClose={() => {
          setDayPickerOpen(false);
          setDayPickerSkipFilledDays(false);
        }}
        rows={dayPickerRows}
        selectedYmd={targetDayYmd}
        onSelectYmd={handleSelectDayFromPicker}
        disableDaysWithMoments={dayPickerSkipFilledDays}
      />

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />

    </SafeAreaView>
  );
}
