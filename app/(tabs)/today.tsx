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
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { format, subDays, isSameDay, parseISO } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { MembershipCard } from "@/components/common/MembershipCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { TryPremiumPill } from "@/components/common/TryPremiumPill";
import { MagicFillBanner } from "@/components/magic-fill/MagicFillBanner";
import {
  resolveCaptureMagicFillBanner,
} from "@/components/magic-fill/CaptureMagicFillOnboardingBanner";
import { useMagicFillGapCount } from "@/hooks/useMagicFillGapCount";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import {
  EllieChatFlow,
  type InputMethod,
  type MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { useChapters } from "@/hooks/useChapters";
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
  getAssetGeoLocation,
  getLivePhotoVideoUri,
  hasFullPhotoLibraryAccess,
  queryCameraPhotosForLocalDay,
  useMediaLibrary,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import { reverseGeocode } from "@/lib/reverseGeocode";
import {
  categorizePhotoBucket,
  photoAgeDays,
  type PhotoBucket,
} from "@/lib/photoBucket";
import {
  CaptureBrowseHeading,
  CaptureStatsCarousel,
  MomentCountPill,
} from "@/components/capture/CaptureBrowseHeading";
import {
  ChapterCoverCard,
  ChapterCoverShimmer,
  ChapterLockedOverlay,
} from "@/components/chapters/ChapterCoverCard";
import { CuratorBrowsePanel } from "@/components/capture/CuratorBrowsePanel";
import { CaptureDaySection } from "@/components/capture/CaptureDaySection";
import { ProgressCapsule } from "@/components/common/ProgressCapsule";
import {
  CaptureDayPickerSheet,
  type DayPickerRow,
} from "@/components/capture/CaptureDayPickerSheet";
import {
  calendarDateForReflectionTarget,
  captureScreenHeading,
  defaultReflectionTarget,
  parseCaptureDayYmd,
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
import { scheduleMashupStartedNotificationsIfNeeded } from "@/lib/mashupNotifications";
import { notifyLifecycleEvent } from "@/lib/lifecycleEvent";
import { syncPushRegistration } from "@/lib/pushRegistration";
import {
  dismissTodayNotificationNudge,
  isTodayNotificationNudgeDismissed,
} from "@/lib/todayNotificationNudge";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { CaptureFirstMomentCoachmarks } from "@/components/capture/CaptureFirstMomentCoachmarks";
import { consumeFirstCaptureAsset } from "@/lib/onboardingHandoff";
import { useCaptureFirstMomentCoachmarkStore } from "@/store/captureFirstMomentCoachmarkStore";
import { useSecondMomentPaywallStore } from "@/store/secondMomentPaywallStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import type { PromptType } from "@/lib/momentAssist";
import { type Entry } from "@/store/entryStore";
import { threadOrdinalByIdMap } from "@/lib/threadOrdinal";
import {
  bucketMomentsByMonth,
  bucketMomentsByWeek,
  bucketMomentsByYear,
} from "@/lib/mashupBuckets";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";
import { momentTitleStyle } from "@/lib/momentTypography";

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
  const { profile, fetchProfile, user } = useAuth();
  const userId = user?.id ?? null;
  const setNotificationEnabled = useSettingsStore((s) => s.setNotificationEnabled);
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const hasCompletedMagicFill = useSettingsStore((s) => s.hasCompletedMagicFill);
  const { count: magicFillGapCount } = useMagicFillGapCount(15);
  const posthog = usePostHog();
  const { entries, fetchEntries, saveEntry } = useEntries();
  const momentCount = useMemo(
    () => entries.filter((e) => e.entry_type === "moment").length,
    [entries]
  );
  // "Days captured" = unique calendar days with at least one moment entry.
  // A day with multiple moments still counts once, matching the user's
  // expectation that this stat reflects how many distinct days they showed
  // up rather than total moment volume.
  const daysCapturedCount = useMemo(() => {
    const days = new Set<string>();
    for (const e of entries) {
      if (e.entry_type !== "moment") continue;
      const day = e.entry_date;
      if (!day) continue;
      days.add(day);
    }
    return days.size;
  }, [entries]);
  const { streakCount, totalMoments } = useStreak();
  const { chapters: capturedChapters, isChapterLocked } = useChapters();
  const chapterCount = capturedChapters.length;

  const coreMemoryCount = useMemo(
    () =>
      entries.filter((e) => e.entry_type === "moment" && e.is_pinned).length,
    [entries]
  );

  const movieCount = useMemo(() => {
    const weeks = bucketMomentsByWeek(entries);
    const months = bucketMomentsByMonth(entries);
    const years = bucketMomentsByYear(entries);
    return weeks.length + months.length + years.length;
  }, [entries]);

  const setOpenChapterId = useTabViewIntentStore((s) => s.setOpenChapterId);
  const setOpenMashupKey = useTabViewIntentStore((s) => s.setOpenMashupKey);
  const setChaptersView = useTabViewIntentStore((s) => s.setChaptersView);

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
  const { threads, fetchAll: fetchThreads, totalConnections, isThreadLocked } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

  const threadOrdinalMap = useMemo(
    () => threadOrdinalByIdMap(threads),
    [threads]
  );

  const todaysChapters = useMemo(() => {
    const today = new Date();
    return capturedChapters.filter((c) =>
      isSameDay(parseISO(c.created_at), today)
    );
  }, [capturedChapters]);

  const todaysThreads = useMemo(() => {
    const today = new Date();
    return threads.filter((t) => isSameDay(parseISO(t.created_at), today));
  }, [threads]);

  const dummyNotificationNudgeEnabled = useTodayNotifDevStore(
    (s) => s.dummyNotificationNudgeEnabled
  );

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [photoBucket, setPhotoBucket] = useState<PhotoBucket | undefined>();
  /** MediaLibrary asset id used to look up the Live Photo paired video at save time. */
  const [photoAssetId, setPhotoAssetId] = useState<string | undefined>();
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
  const [wantsNewMoment, setWantsNewMoment] = useState(false);
  const captureDateInitializedRef = useRef(false);
  const [captureTargetDate, setCaptureTargetDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  // Capture is single-day: the page shows only the day matching
  // `captureTargetDate`. Day changes happen via the picker sheet ("Other
  // days" CTA or the chevron) or via the `?day=` deep link from Capsule.
  const [justSaved, setJustSaved] = useState(false);
  const {
    capture: captureParam,
    onboardingFirstMoment: onboardingFirstMomentParam,
    openCamera: openCameraParam,
    day: dayParam,
  } = useLocalSearchParams<{
    capture?: string;
    onboardingFirstMoment?: string;
    openCamera?: string;
    /** `yyyy-MM-dd` — seed `captureTargetDate` (e.g. from Capsule grid). */
    day?: string;
  }>();
  const inputMethodRef = useRef<InputMethod | null>(null);
  const pendingCoachmarks = useCaptureFirstMomentCoachmarkStore(
    (s) => s.pendingAfterFirstCapture
  );
  const coachmarksCompleted = useCaptureFirstMomentCoachmarkStore(
    (s) => s.completedAfterFirstCapture
  );
  const coachmarksVisible = useCaptureFirstMomentCoachmarkStore(
    (s) => s.visible
  );
  const expectOnboardingFirstCaptureRef = useRef(false);
  const secondMomentPaywallShown = useSecondMomentPaywallStore(
    (s) => s.hasShown
  );
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

  const isCaptureToday = useMemo(
    () => targetDayYmd === format(new Date(), "yyyy-MM-dd"),
    [targetDayYmd]
  );

  const viewMonthWipBucket = useMemo(() => {
    const key = `${captureTargetDate.getFullYear()}-${String(captureTargetDate.getMonth() + 1).padStart(2, "0")}`;
    return (
      bucketMomentsByMonth(entries).find((b) => b.key === key && b.count > 0) ??
      null
    );
  }, [entries, captureTargetDate]);

  useEffect(() => {
    if (!profile || captureDateInitializedRef.current) return;
    captureDateInitializedRef.current = true;
    if (dayParam || onboardingFirstMomentParam === "1") {
      // Onboarding handoff or `?day=` deep link owns the initial capture day.
      return;
    }
    setCaptureTargetDate(
      calendarDateForReflectionTarget(defaultReflectionTarget(profile))
    );
  }, [profile, dayParam, onboardingFirstMomentParam]);

  const targetDayEntries: Entry[] = useMemo(
    () =>
      entries.filter(
        (e) => e.entry_date === targetDayYmd && e.entry_type === "moment"
      ),
    [entries, targetDayYmd]
  );

  const captureMagicFillOnboardingVariant = useMemo(
    () =>
      resolveCaptureMagicFillBanner({
        totalMomentCount: totalMoments,
        hasCompletedMagicFill,
        viewingDayHasMoment: targetDayEntries.length > 0,
      }),
    [
      hasCompletedMagicFill,
      totalMoments,
      targetDayEntries.length,
    ]
  );

  useEffect(() => {
    if (!captureMagicFillOnboardingVariant) return;
    posthog.capture("magic_fill_onboarding_banner_viewed", {
      variant: captureMagicFillOnboardingVariant,
      total_moments: totalMoments,
    });
  }, [captureMagicFillOnboardingVariant, posthog, totalMoments]);

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
      if (coachmarksCompleted || !pendingCoachmarks || coachmarksVisible) {
        return;
      }
      if (targetDayEntries.length === 0) return;
      const timer = setTimeout(() => {
        useCaptureFirstMomentCoachmarkStore.getState().start();
      }, 700);
      return () => clearTimeout(timer);
    }, [
      coachmarksCompleted,
      pendingCoachmarks,
      coachmarksVisible,
      targetDayEntries.length,
    ])
  );

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
    setPhotoAssetId(undefined);
    setPinnedQuestion(null);
    setShuffleCount(0);
    setQuestionAutoStart(null);
    inputMethodRef.current = null;
  }, []);

  // Reset to the default reflection day when the calendar day rolls over
  // while the app is backgrounded. Without this, foregrounding the next
  // morning would still show the stale `captureTargetDate` (e.g. heading
  // says "Today" but the day, entries and dayPhotos are all from
  // yesterday) until the user cold-starts the app.
  const lastActiveDayYmdRef = useRef<string>(format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const currentYmd = format(new Date(), "yyyy-MM-dd");
      const previousYmd = lastActiveDayYmdRef.current;
      lastActiveDayYmdRef.current = currentYmd;
      if (currentYmd === previousYmd) return;
      // Day rolled over. Refresh server data unconditionally; only
      // reset capture state when the user isn't mid-flow with a pinned
      // photo or question (otherwise we'd discard their in-progress
      // work).
      void fetchEntries();
      void fetchThreads();
      if (isPinnedForEllie) return;
      setCaptureTargetDate(
        calendarDateForReflectionTarget(defaultReflectionTarget(profile))
      );
      clearPinState();
      setLastSavedEntryId(null);
      setWantsNewMoment(false);
    });
    return () => sub.remove();
  }, [profile, isPinnedForEllie, clearPinState, fetchEntries, fetchThreads]);

  const handleReturnToPhotoPicker = useCallback(() => {
    clearPinState();
    setTabBarHidden(false);
    setWantsNewMoment(true);
  }, [clearPinState, setTabBarHidden]);

  useEffect(() => {
    if (!dayParam) return;
    if (onboardingFirstMomentParam === "1") return;
    const targetDate = parseCaptureDayYmd(dayParam);
    if (!targetDate) {
      router.setParams({ day: undefined });
      return;
    }
    jumpToDay(targetDate);
    clearPinState();
    setLastSavedEntryId(null);
    setWantsNewMoment(true);
    router.setParams({ day: undefined });
  }, [dayParam, onboardingFirstMomentParam, clearPinState, jumpToDay]);

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
      setPhotoAssetId(asset.id);
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
      rows.push({
        ymd,
        titleLine: format(d, "EEE"),
        subtitle: format(d, "MMM d, yyyy"),
        hasMoment: momentDates.has(ymd),
        isDefaultRow: ymd === defaultDayYmd,
        photoCount: dayPickerPhotoCounts[ymd] ?? null,
      });
    }
    return rows;
  }, [entries, defaultDayYmd, dayPickerPhotoCounts]);

  /**
   * Set the active capture day. Used by both the picker sheet and the
   * `?day=` deep link — single source of truth for switching days.
   */
  const jumpToDay = useCallback((targetDate: Date) => {
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    setCaptureTargetDate(target);
  }, []);

  const handleSelectDayFromPicker = useCallback(
    (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const target = new Date(y, m - 1, d);
      jumpToDay(target);
      clearPinState();
      setLastSavedEntryId(null);
      const hasMomentForDay = entries.some(
        (e) => e.entry_type === "moment" && e.entry_date === ymd
      );
      setWantsNewMoment(!hasMomentForDay);
      posthog.capture("capture_day_selected", { ymd, had_moment: hasMomentForDay });
    },
    [clearPinState, posthog, entries, jumpToDay]
  );

  const handleCaptureAnotherForTargetDay = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("capture_another_same_day_tapped", {
      ymd: targetDayYmd,
      existing_moment_count: targetDayEntries.length,
    });
    setDayPickerOpen(false);
    setDayPickerSkipFilledDays(false);
    clearPinState();
    setLastSavedEntryId(null);
    setWantsNewMoment(true);
  }, [clearPinState, posthog, targetDayEntries.length, targetDayYmd]);

  // Rolling "time left in the year" — ticks every second so users see
  // a live h/m/s countdown on the year-captured progress bar's right
  // segment (e.g. `4928h 17m 03s`). Sized to fit beside the % label
  // even when the violet fill is short.
  const [yearTickNow, setYearTickNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setYearTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Minutes until local midnight — how long the user has left to capture today.
  const minutesLeftToCapture = useMemo(() => {
    const d = new Date(yearTickNow);
    const endOfDay = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    const msLeft = Math.max(0, endOfDay - yearTickNow);
    return Math.max(1, Math.ceil(msLeft / (1000 * 60)));
  }, [yearTickNow]);

  const captureTimeLeftLabel = useMemo(() => {
    const n = minutesLeftToCapture;
    return `${n.toLocaleString()} minute${n === 1 ? "" : "s"} left for today`;
  }, [minutesLeftToCapture]);

  /** Year progress: distinct days with at least one moment in the current
   *  calendar year ÷ days elapsed so far in the same year. Drives the bar
   *  at the bottom of the day section. */
  const yearProgress = useMemo(() => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysElapsed = Math.max(
      1,
      Math.round((today.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24)) +
        1
    );
    const yearPrefix = String(now.getFullYear());
    const captured = new Set<string>();
    for (const e of entries) {
      if (e.entry_type !== "moment" || !e.entry_date) continue;
      if (!e.entry_date.startsWith(yearPrefix)) continue;
      captured.add(e.entry_date);
    }
    const capturedDays = captured.size;
    return {
      capturedDays,
      daysElapsed,
      ratio: capturedDays / daysElapsed,
      year: now.getFullYear(),
    };
  }, [entries]);

  /** Entries indexed by `entry_date` for fast per-day lookup in feed sections. */
  const entriesByYmd = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      if (e.entry_type !== "moment" || !e.entry_date) continue;
      const prev = map.get(e.entry_date) ?? [];
      prev.push(e);
      map.set(e.entry_date, prev);
    }
    return map;
  }, [entries]);

  /** Per-day pin handlers (used by `CaptureDaySection`). Set the target day
   *  first so the rest of the pipeline (save, `entry_date`) lands correctly. */
  const handlePinPhotoForDay = useCallback(
    (asset: MediaAsset, dayDate: Date) => {
      setCaptureTargetDate(dayDate);
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      setPhotoUri(asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setPhotoAssetId(asset.id);
      setShuffleCount(0);
      posthog.capture("photo_pinned", {
        target_ymd: format(dayDate, "yyyy-MM-dd"),
        photo_bucket: bucket,
        photo_age_days: photoAgeDays(asset.creationTime),
        source: "feed",
      });
    },
    [posthog]
  );

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
      const asset = consumeFirstCaptureAsset();
      const dayFromParam = dayParam ? parseCaptureDayYmd(dayParam) : null;
      let pinDay = dayFromParam ?? captureTargetDate;
      if (!dayFromParam && asset) {
        const taken = new Date(asset.creationTime);
        pinDay = new Date(
          taken.getFullYear(),
          taken.getMonth(),
          taken.getDate()
        );
      }
      if (asset) {
        handlePinPhotoForDay(asset, pinDay);
      } else if (dayFromParam) {
        jumpToDay(dayFromParam);
      }
    }

    router.setParams({
      ...(captureParam === "1" ? { capture: undefined } : {}),
      ...(onboardingFirstMomentParam === "1"
        ? { onboardingFirstMoment: undefined, day: undefined }
        : {}),
    });
  }, [
    captureParam,
    onboardingFirstMomentParam,
    dayParam,
    clearPinState,
    captureTargetDate,
    handlePinPhotoForDay,
    jumpToDay,
  ]);

  const handleStartQuestionForDay = useCallback(
    (
      q: ReflectionQuestionItem,
      method: "speaking" | "typing",
      dayDate: Date
    ) => {
      setCaptureTargetDate(dayDate);
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setPinnedQuestion(q);
      setShuffleCount(0);
      setQuestionAutoStart(method);
      posthog.capture("question_pinned", {
        target_ymd: format(dayDate, "yyyy-MM-dd"),
        question_id: q.id,
        input_method: method,
        source: "feed",
      });
    },
    [posthog]
  );

  /** "Today In Your Past" carousel — the moment lands on the photo's date,
   *  so a 2018 photo creates a moment in 2018, not the current year. */
  const handleLogPastMoment = useCallback(
    (asset: MediaAsset) => {
      const takenDate = new Date(asset.creationTime);
      const dayDate = new Date(
        takenDate.getFullYear(),
        takenDate.getMonth(),
        takenDate.getDate()
      );
      setCaptureTargetDate(dayDate);
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      setPhotoUri(asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setPhotoAssetId(asset.id);
      setShuffleCount(0);
      posthog.capture("today_in_past_photo_pinned", {
        target_ymd: format(dayDate, "yyyy-MM-dd"),
        photo_year: takenDate.getFullYear(),
      });
    },
    [posthog]
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
      const totalMomentsBeforeSave = momentCount;
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
        const assetIdAtSave = photoAssetId;
        void (async () => {
          try {
            const { publicUrl, storagePath } = await uploadEntryMedia(
              userId,
              entryId,
              entry.attachedPhotoUri!,
              "image"
            );

            // Live Photo: upload the paired video so we can loop it inline.
            let pairedVideoStoragePath: string | null = null;
            let pairedVideoStorageUrl: string | null = null;
            // EXIF geo → "City, Country" label, persisted on the media row
            // so every render of this moment can show the location pill
            // without a fresh reverse-geocode call.
            let locationName: string | null = null;
            let locationLatitude: number | null = null;
            let locationLongitude: number | null = null;
            if (assetIdAtSave) {
              try {
                const paired = await getLivePhotoVideoUri(assetIdAtSave);
                if (paired?.uri) {
                  const upload = await uploadEntryMedia(
                    userId,
                    entryId,
                    paired.uri,
                    "video"
                  );
                  pairedVideoStoragePath = upload.storagePath;
                  pairedVideoStorageUrl = upload.publicUrl;
                  posthog.capture("live_photo_uploaded", {
                    entry_id: entryId,
                    duration_ms: paired.durationMs,
                  });
                }
              } catch (err) {
                console.warn("[TodayScreen] Live Photo upload failed:", err);
              }

              try {
                const info = await getAssetGeoLocation(assetIdAtSave);
                if (info) {
                  locationLatitude = info.latitude;
                  locationLongitude = info.longitude;
                  locationName = await reverseGeocode(
                    info.latitude,
                    info.longitude
                  );
                }
              } catch (err) {
                console.warn("[TodayScreen] Location lookup failed:", err);
              }
            }

            await supabase.from("entry_media").insert({
              entry_id: entryId,
              user_id: userId,
              storage_path: storagePath,
              storage_url: publicUrl,
              media_type: "image",
              display_order: 0,
              taken_at: takenAtIso,
              paired_video_storage_path: pairedVideoStoragePath,
              paired_video_storage_url: pairedVideoStorageUrl,
              location_name: locationName,
              location_latitude: locationLatitude,
              location_longitude: locationLongitude,
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

      if (saved?.id && entry.attachedPhotoUri) {
        void scheduleMashupStartedNotificationsIfNeeded({
          entryDateYmd: memoryYmd,
          momentsBeforeSave: entries.filter((e) => e.entry_type === "moment"),
        });
      }

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

      if (expectOnboardingFirstCaptureRef.current) {
        expectOnboardingFirstCaptureRef.current = false;
        setAwaitingFirstOnboardingCapture(false);
      }

      if (saved?.id && totalMomentsBeforeSave === 0) {
        useCaptureFirstMomentCoachmarkStore.getState().queueAfterFirstCapture();
        setTimeout(() => {
          useCaptureFirstMomentCoachmarkStore.getState().start();
        }, 900);
      }

      if (
        saved?.id &&
        totalMomentsBeforeSave === 1 &&
        profile?.subscription_status === "free" &&
        !secondMomentPaywallShown
      ) {
        useSecondMomentPaywallStore.getState().markShown();
        setTimeout(() => {
          router.push("/paywall");
        }, 1200);
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
      photoAssetId,
      momentCount,
      entries,
      profile?.subscription_status,
      secondMomentPaywallShown,
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
      <CaptureTabTopBar showPremium={false} />

      {!isPinnedForEllie ? (
        <Animated.ScrollView
          style={{ flex: 1, opacity: postSaveOpacity }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: colors.background,
              marginBottom: targetDayEntries.length > 0 ? 18 : 0,
            }}
          >
            <CaptureBrowseHeading
              upperLabel={
                targetDayEntries.length > 0
                  ? "YOU CAPTURED"
                  : isCaptureToday
                    ? "CAPTURE TODAY!"
                    : "CAPTURING FOR"
              }
              title={captureHeading.title}
              titleSecondary={captureHeading.titleSecondary}
              statsRow={
                <CaptureStatsCarousel
                  moments={momentCount}
                  chapters={chapterCount}
                  coreMemories={coreMemoryCount}
                  movies={movieCount}
                  currentStreak={streakCount}
                />
              }
              onPressChangeDay={() => {
                setDayPickerSkipFilledDays(false);
                setDayPickerOpen(true);
              }}
            />
          </View>

          {showHome && todaysChapters.length + todaysThreads.length > 0 ? (
            <View style={{ paddingHorizontal: 20, gap: 12, marginBottom: 16 }}>
              {todaysChapters.map((chapter) => {
                const locked = isChapterLocked(chapter);
                return (
                  <Pressable
                    key={chapter.id}
                    onPress={() => {
                      if (locked) {
                        launchPremiumFlow(posthog, "capture_chapter_banner", {
                          bump: { surface: "chapter", refId: chapter.id },
                        });
                        return;
                      }
                      setOpenChapterId(chapter.id);
                      router.push("/(tabs)/chapters");
                    }}
                    style={{
                      height: 220,
                      borderRadius: 18,
                      overflow: "hidden",
                      backgroundColor: colors.surfaceSecondary,
                    }}
                  >
                    <ChapterCoverCard chapter={chapter} />
                    <ChapterCoverShimmer
                      chapterId={chapter.id}
                      viewedAt={chapter.viewed_at}
                    />
                    {locked ? <ChapterLockedOverlay /> : null}
                  </Pressable>
                );
              })}
              {todaysThreads.map((thread) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  locked={isThreadLocked(
                    thread,
                    threads.findIndex((t) => t.id === thread.id)
                  )}
                  headline="1 New Thread found"
                  ordinalRank={threadOrdinalMap.get(thread.id)}
                />
              ))}
            </View>
          ) : null}

          <CaptureDaySection
            date={captureTargetDate}
            ymd={targetDayYmd}
            entriesForDay={targetDayEntries}
            permissionStatus={permissionStatus}
            accessPrivileges={accessPrivileges}
            onPinPhoto={handlePinPhotoForDay}
            onStartQuestion={handleStartQuestionForDay}
            onLogPastMoment={handleLogPastMoment}
            onOpenEntry={(entry) => {
              posthog.capture("today_entry_tapped", {
                entry_id: entry.id,
                source: "single_day",
              });
              router.push(`/entry/${entry.id}`);
            }}
            onShareEntry={(entry) => {
              setLastSavedEntryId(entry.id);
              setShareModalVisible(true);
              posthog.capture("today_entry_share_tapped", {
                entry_id: entry.id,
                source: "single_day",
              });
            }}
            onDigDeeper={(entry) => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: "/dig-deeper",
                params: {
                  entryId: entry.id,
                  title: entry.title ?? "",
                  body: entry.body ?? "",
                  photoUri: entry.media?.[0]?.storage_url ?? "",
                },
              });
            }}
            monthWipBucket={viewMonthWipBucket}
            onOpenMonthWip={(bucket) => {
              setChaptersView("grid");
              setOpenMashupKey(bucket.key);
              router.push("/(tabs)/chapters");
            }}
            reportCoachmarkTarget={(key, layout) => {
              useCaptureFirstMomentCoachmarkStore.getState().setTargets({
                [key]: layout,
              });
            }}
            magicFillOnboardingVariant={captureMagicFillOnboardingVariant}
          />

          {hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges) ? (
            <View style={{ marginTop: 20 }}>
              <MagicFillBanner
                source="capture_banner"
                gapCount={magicFillGapCount ?? undefined}
                prominent
              />
            </View>
          ) : null}

          {profile?.subscription_status === "free" ? (
            <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
              <MembershipCard
                colors={colors}
                subscriptionStatus={profile.subscription_status}
                createdAt={profile.created_at ?? null}
                onManage={() => router.push("/paywall")}
                onExplore={() => {
                  posthog.capture("premium_card_tapped", {
                    source: "capture_footer",
                  });
                  launchPremiumFlow(posthog, "capture_footer_banner");
                }}
              />
            </View>
          ) : null}

          {/* Year-captured nudge — lowest content in the scroll */}
          <View
            style={{
              marginTop: 28,
              paddingHorizontal: 20,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                letterSpacing: 1.2,
                color: colors.textMuted,
                marginBottom: 8,
              }}
            >
              {`Your ${yearProgress.year} captured (so far)`}
            </Text>
            <ProgressCapsule
              progress={yearProgress.ratio}
              labelFilled={`${(yearProgress.ratio * 100).toFixed(2)}%`}
              labelRight={captureTimeLeftLabel}
              labelFilledColor="#1A1A1A"
              labelRightColor="#1A1A1A"
              height={32}
            />
          </View>

          {/* Other days CTA — restyled to match the "Capture with a
              question instead" secondary button: a single horizontal
              row (icon · label · chevron) inside a rounded outlined chip. */}
          <View style={{ alignItems: "center", marginTop: 20, marginBottom: 8 }}>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDayPickerSkipFilledDays(false);
                setDayPickerOpen(true);
                posthog.capture("capture_other_days_tapped");
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              hitSlop={6}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 9999,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                }}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={colors.text}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: colors.text,
                    marginRight: 8,
                  }}
                >
                  Other days
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.textMuted}
                />
              </View>
            </Pressable>
          </View>
        </Animated.ScrollView>
      ) : null}

      {/* Legacy showHome path kept for fallback during transition — never reached. */}
      {false ? (
        <Animated.ScrollView
          style={{ flex: 1, opacity: postSaveOpacity }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginHorizontal: -20, marginBottom: 8 }}>
            <CaptureBrowseHeading
              upperLabel="YOU CAPTURED"
              title={captureHeading.title}
              titleSecondary={captureHeading.titleSecondary}
              tagBubble={
                targetDayEntries.length > 0 ? (
                  <MomentCountPill count={targetDayEntries.length} />
                ) : undefined
              }
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
          {threads.map((thread) => (
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
                            style={momentTitleStyle({
                              fontSize: 16,
                              color: colors.text,
                              marginBottom: 6,
                            })}
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
                      <EntryPinToggle entryId={item.id} />
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
                if (!successHighlightEntry) return;
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
                titleSecondary={captureHeading.titleSecondary}
                tagBubble={
                  targetDayEntries.length > 0 ? (
                    <MomentCountPill count={targetDayEntries.length} />
                  ) : undefined
                }
                onPressChangeDay={() => {
                  setDayPickerSkipFilledDays(false);
                  setDayPickerOpen(true);
                }}
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
      ) : null}

      <CaptureFirstMomentCoachmarks />

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
        primaryAction={
          dayPickerSkipFilledDays && targetDayEntries.length > 0
            ? {
                label: `Capture another for ${captureHeading.title.toLowerCase()}`,
                onPress: handleCaptureAnotherForTargetDay,
                iconName: "add-circle-outline",
              }
            : undefined
        }
      />

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />

    </SafeAreaView>
  );
}
