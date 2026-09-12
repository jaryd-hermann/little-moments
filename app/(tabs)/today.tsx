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
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import {
  format,
  subDays,
  isSameDay,
  parseISO,
  differenceInCalendarDays,
} from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { MembershipCard } from "@/components/common/MembershipCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { MadeByJarydBanner } from "@/components/common/MadeByJarydBanner";
import { launchMagicFill } from "@/lib/magicFillLaunch";
import { yearCaptureProgress } from "@/lib/yearCapture";
import { attachVoiceNoteToEntry } from "@/lib/entryVoiceNote";
import type { VoiceClip } from "@/components/composer/MicRecorder";
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
import * as MediaLibrary from "expo-media-library";
import {
  hasFullPhotoLibraryAccess,
  queryCameraPhotosForLocalDay,
  queryRecentCameraMediaPage,
  useMediaLibrary,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
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
  ChapterLockedOverlay,
} from "@/components/chapters/ChapterCoverCard";
import { CuratorBrowsePanel } from "@/components/capture/CuratorBrowsePanel";
import { CaptureDaySection } from "@/components/capture/CaptureDaySection";
import { CaptureSectionHeading } from "@/components/capture/CaptureSectionHeading";
import {
  RecentMomentsCarousel,
  type RecentFeedItem,
  type RecentMomentsCarouselHandle,
} from "@/components/capture/RecentMomentsCarousel";
import { YearCaptureProgressBlock } from "@/components/common/YearCaptureProgressBlock";
import { VideoTrimSheet } from "@/components/capture/VideoTrimSheet";
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
import { useThreadDevStore, makeDummyThread, THREAD_DEV_PREVIEW_ID } from "@/store/threadDevStore";
import { useTodayNotifDevStore } from "@/store/todayNotifDevStore";
import { useMagicFillDevStore } from "@/store/magicFillDevStore";
import { useThreads } from "@/hooks/useThreads";
import { ThreadCard } from "@/components/threads/ThreadCard";
import { shareInvite } from "@/lib/inviteShare";
import { attachEntryMedia } from "@/lib/attachEntryMedia";
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
import { TryPremiumPill } from "@/components/common/TryPremiumPill";
import { useSettingsStore } from "@/store/settingsStore";
import { useTabBarStore } from "@/store/tabBarStore";
import {
  consumeFirstCaptureAsset,
  consumeFirstCaptureHandoff,
} from "@/lib/onboardingHandoff";
import { useFirstMomentChatStore } from "@/store/firstMomentChatStore";
import {
  shouldAutoShowPaywallAtCount,
  useSecondMomentPaywallStore,
} from "@/store/secondMomentPaywallStore";
import { EntryMediaImage } from "@/components/common/EntryMediaImage";
import type { PromptType } from "@/lib/momentAssist";
import { type Entry } from "@/store/entryStore";
import {
  bucketMomentsByMonth,
  bucketMomentsByWeek,
  bucketMomentsByYear,
  movieProgress,
} from "@/lib/mashupBuckets";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";
import { momentTitleStyle } from "@/lib/momentTypography";

const CREAM = "#F7F2E6";

/**
 * Magic Fill is promoted above "this day in your past" for users who are still
 * building a library, or who have drifted away from capturing.
 */
const MAGIC_FILL_PROMOTE_BELOW_MOMENTS = 10;
const MAGIC_FILL_PROMOTE_AFTER_IDLE_DAYS = 5;

const WORDMARK_LIGHT_ON_DARK = require("@/assets/images/wordmark-little-moments.png");
const WORDMARK_DARK_ON_LIGHT = require("@/assets/images/wordmark-little-moments-black.png");

function CaptureTabTopBar() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const subscriptionStatus = useAuthStore((s) => s.profile?.subscription_status);
  // Magic Fill is a premium surface in the header; everyone else sees the
  // upgrade pill in its place.
  const isPremium =
    subscriptionStatus === "active" || subscriptionStatus === "trial";
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
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
        {isPremium ? (
          <Pressable
            accessibilityLabel="Magic Fill"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              posthog?.capture("magic_fill_entry_tapped", {
                source: "capture_header",
              });
              launchMagicFill("capture_header");
            }}
            hitSlop={8}
            style={{
              height: 28,
              paddingHorizontal: 11,
              borderRadius: 9999,
              backgroundColor: "#FECFB4",
              borderWidth: 2,
              borderColor: "#000000",
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 1,
              shadowRadius: 0,
              elevation: 4,
            }}
          >
            <Text style={{ fontSize: 11, color: "#1A1A1A" }}>✦</Text>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                color: "#1A1A1A",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Magic Fill
            </Text>
          </Pressable>
        ) : (
          <TryPremiumPill source="capture_header" compact />
        )}
      </View>
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
  );
}

export default function TodayScreen() {
  const { colors, theme } = useTheme();
  const { profile, fetchProfile, user } = useAuth();
  const userId = user?.id ?? null;
  const setNotificationEnabled = useSettingsStore((s) => s.setNotificationEnabled);
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const streaksEnabled = useSettingsStore((s) => s.streaksEnabled);
  const hasCompletedMagicFill = useSettingsStore((s) => s.hasCompletedMagicFill);
  const devForceOnboardingBanner = useMagicFillDevStore(
    (s) => s.forceOnboardingBanner
  );
  const devForceOnboardingVariant = useMagicFillDevStore(
    (s) => s.forceOnboardingVariant
  );
  const devIgnoreMagicFillCompleted = useMagicFillDevStore(
    (s) => s.ignoreMagicFillCompleted
  );
  // Largest gap target we offer — gives the widest window for "how many days
  // are still uncaptured", which the day-picker CTA keys off.
  const { count: magicFillGapCount } = useMagicFillGapCount(10);
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
  /**
   * Calendar days since the most recent captured moment. `null` when the user
   * has never captured, so callers can treat "new" and "lapsed" separately.
   */
  const daysSinceLastCapture = useMemo(() => {
    let latest: Date | null = null;
    for (const e of entries) {
      if (e.entry_type !== "moment" || !e.entry_date) continue;
      const d = parseISO(e.entry_date);
      if (Number.isNaN(d.getTime())) continue;
      if (!latest || d > latest) latest = d;
    }
    return latest ? differenceInCalendarDays(new Date(), latest) : null;
  }, [entries]);
  /** Promote Magic Fill above "this day in your past" for thin or lapsed libraries. */
  const promoteMagicFillBanner =
    momentCount < MAGIC_FILL_PROMOTE_BELOW_MOMENTS ||
    (daysSinceLastCapture !== null &&
      daysSinceLastCapture > MAGIC_FILL_PROMOTE_AFTER_IDLE_DAYS);
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
  const { threads, fetchAll: fetchThreads, totalConnections, isThreadLocked, stats, updateThreadAnswerLocal } = useThreads();
  const dummyThreadEnabled = useThreadDevStore((s) => s.dummyThreadEnabled);

  const todaysChapters = useMemo(() => {
    const today = new Date();
    return capturedChapters.filter((c) =>
      isSameDay(parseISO(c.created_at), today)
    );
  }, [capturedChapters]);

  const todaysThreads = useMemo(() => {
    const today = new Date();
    const real = threads.filter((t) =>
      !t.dismissed && isSameDay(parseISO(t.created_at), today)
    );
    if (__DEV__ && dummyThreadEnabled) {
      return [
        makeDummyThread(),
        ...real.filter((t) => t.id !== THREAD_DEV_PREVIEW_ID),
      ];
    }
    return real;
  }, [threads, dummyThreadEnabled]);

  const dummyNotificationNudgeEnabled = useTodayNotifDevStore(
    (s) => s.dummyNotificationNudgeEnabled
  );

  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [pinnedPreviewAsset, setPinnedPreviewAsset] = useState<MediaAsset | null>(
    null
  );
  const [photoVideoClipStartSec, setPhotoVideoClipStartSec] = useState(0);
  const [videoTrimAsset, setVideoTrimAsset] = useState<MediaAsset | null>(null);
  const [videoTrimDayDate, setVideoTrimDayDate] = useState<Date | null>(null);
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
  // Continuous "recent moments" feed powering the persistent picker carousel.
  const [recentMedia, setRecentMedia] = useState<MediaAsset[]>([]);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [recentHasMore, setRecentHasMore] = useState(true);
  // Starts true so the carousel's one-time initial scroll waits for the feed
  // (otherwise onboarding would strand on the today-empty slide).
  const [recentLoading, setRecentLoading] = useState(true);
  const recentLoadingMoreRef = useRef(false);
  const carouselRef = useRef<RecentMomentsCarouselHandle>(null);
  const browseScrollRef = useRef<ScrollView>(null);
  // Day (yyyy-MM-dd) the carousel should snap to once its slide is loaded.
  // Set by the day picker and the Capsule `?day=` deep link; the feed pages
  // deeper until the day appears (bounded by `carouselScrollPagesRef`).
  const [pendingCarouselDay, setPendingCarouselDay] = useState<string | null>(
    null
  );
  const carouselScrollPagesRef = useRef(0);
  // After a save we scroll the feed down to the day's captured moments so the
  // user immediately sees what they just added.
  const pendingScrollToCapturedRef = useRef(false);
  /** Below-fold sections (past carousel, WIP movie, footer) mount after scroll or idle. */
  const [belowFoldUnlocked, setBelowFoldUnlocked] = useState(false);
  /**
   * Scroll-to-"this day in your past" plumbing for the recap push. The target
   * offset is only knowable once both the day section and the past carousel
   * inside it have laid out, so each reports its `y` and whichever lands last
   * performs the scroll.
   */
  const captureDaySectionYRef = useRef(0);
  const pastSectionInnerYRef = useRef<number | null>(null);
  const pendingScrollToPastRef = useRef(false);
  const tryScrollToPastSection = useCallback(() => {
    if (!pendingScrollToPastRef.current) return;
    const inner = pastSectionInnerYRef.current;
    if (inner == null) return;
    pendingScrollToPastRef.current = false;
    const y = Math.max(0, captureDaySectionYRef.current + inner - 12);
    requestAnimationFrame(() => {
      browseScrollRef.current?.scrollTo({ y, animated: true });
    });
  }, []);
  // Live day shown in the header as the carousel scrolls (updates immediately);
  // `captureTargetDate` only follows on swipe-settle so the heavy per-day
  // content below re-targets without churning during the swipe.
  const [headerDate, setHeaderDate] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  });
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
    scrollTo: scrollToParam,
  } = useLocalSearchParams<{
    capture?: string;
    onboardingFirstMoment?: string;
    openCamera?: string;
    /** `yyyy-MM-dd` — seed `captureTargetDate` (e.g. from Capsule grid). */
    day?: string;
    /** `past` — land scrolled to "this day in your past" (recap push). */
    scrollTo?: string;
  }>();
  const inputMethodRef = useRef<InputMethod | null>(null);
  /** Input method the onboarding chat committed to, consumed by the next pin. */
  const pendingPhotoAutoStartRef = useRef<InputMethod | null>(null);
  /** True while the onboarding chat is waiting on us to capture its pick. */
  const awaitingChatFirstCapture = useFirstMomentChatStore(
    (s) => s.awaitingFirstCaptureReturn
  );
  const expectOnboardingFirstCaptureRef = useRef(false);
  const lastPaywallShownAtCount = useSecondMomentPaywallStore(
    (s) => s.lastShownAtCount
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

  // `bucketMomentsByMonth` already drops months below the movie threshold, so
  // a hit here means the month has earned its WIP movie.
  const viewMonthWipBucket = useMemo(() => {
    const key = `${captureTargetDate.getFullYear()}-${String(captureTargetDate.getMonth() + 1).padStart(2, "0")}`;
    return bucketMomentsByMonth(entries).find((b) => b.key === key) ?? null;
  }, [entries, captureTargetDate]);

  /**
   * Progress toward the current month's movie. Only the current month gets
   * this nudge — a past month can't be topped up, so showing it there would
   * just be a dead end.
   */
  const monthWipProgress = useMemo(() => {
    if (viewMonthWipBucket) return null;
    const now = new Date();
    const isCurrentMonth =
      captureTargetDate.getFullYear() === now.getFullYear() &&
      captureTargetDate.getMonth() === now.getMonth();
    if (!isCurrentMonth) return null;
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return movieProgress(entries, "month", key);
  }, [viewMonthWipBucket, entries, captureTargetDate]);

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
        totalMomentCount: momentCount,
        hasCompletedMagicFill,
        viewingDayHasMoment: targetDayEntries.length > 0,
        devForceVariant:
          __DEV__ && devForceOnboardingBanner ? devForceOnboardingVariant : null,
        devIgnoreCompleted: __DEV__ && devIgnoreMagicFillCompleted,
      }),
    [
      devForceOnboardingBanner,
      devForceOnboardingVariant,
      devIgnoreMagicFillCompleted,
      hasCompletedMagicFill,
      momentCount,
      targetDayEntries.length,
    ]
  );

  useEffect(() => {
    if (!captureMagicFillOnboardingVariant) return;
    posthog.capture("magic_fill_onboarding_banner_viewed", {
      variant: captureMagicFillOnboardingVariant,
      total_moments: momentCount,
    });
  }, [captureMagicFillOnboardingVariant, posthog, momentCount]);

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
      setBelowFoldUnlocked(false);
      return () => setBelowFoldUnlocked(false);
    }, [])
  );

  useEffect(() => {
    if (belowFoldUnlocked) return;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      idleTimer = setTimeout(() => setBelowFoldUnlocked(true), 2500);
    });
    return () => {
      task.cancel();
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, [belowFoldUnlocked, captureTargetDate]);

  // Recap push ("log this day from your past") lands here. The past carousel
  // lives below the fold, so unlock it immediately rather than waiting for the
  // idle timer.
  useEffect(() => {
    if (scrollToParam !== "past") return;
    pendingScrollToPastRef.current = true;
    setBelowFoldUnlocked(true);
    router.setParams({ scrollTo: undefined });
  }, [scrollToParam]);

  const handleBrowseScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (belowFoldUnlocked) return;
      if (e.nativeEvent.contentOffset.y > 100) {
        setBelowFoldUnlocked(true);
      }
    },
    [belowFoldUnlocked]
  );

  useFocusEffect(
    useCallback(() => {
      fetchEntries(undefined, { background: true });
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
    setPinnedPreviewAsset(null);
    setPhotoVideoClipStartSec(0);
    setVideoTrimAsset(null);
    setVideoTrimDayDate(null);
    setPinnedQuestion(null);
    setShuffleCount(0);
    setQuestionAutoStart(null);
    inputMethodRef.current = null;
  }, []);

  const commitPinnedPhoto = useCallback(
    (
      asset: MediaAsset,
      dayDate: Date,
      opts?: { resolvedUri?: string; clipStartSec?: number }
    ) => {
      setCaptureTargetDate(dayDate);
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      // Photos normally wait for the user to tap speak or type on the Ellie
      // screen. The onboarding chat is the exception — they already chose
      // there — so honour a pending request once, then clear it. Held in a ref
      // so the video path picks it up after the trim editor too.
      setQuestionAutoStart(pendingPhotoAutoStartRef.current);
      pendingPhotoAutoStartRef.current = null;
      setPhotoUri(opts?.resolvedUri ?? asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setPhotoAssetId(asset.id);
      setPinnedPreviewAsset({
        ...asset,
        uri: opts?.resolvedUri ?? asset.uri,
      });
      setPhotoVideoClipStartSec(opts?.clipStartSec ?? 0);
      setShuffleCount(0);
      posthog.capture("photo_pinned", {
        target_ymd: format(dayDate, "yyyy-MM-dd"),
        photo_bucket: bucket,
        photo_age_days: photoAgeDays(asset.creationTime),
        source: "feed",
        media_type: asset.mediaType,
        video_clip_start_sec: opts?.clipStartSec ?? 0,
      });
    },
    [posthog]
  );

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
      void fetchEntries(undefined, { force: true });
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

  /**
   * Set the active capture day. Used by the picker sheet, the `?day=` deep
   * link, and the carousel — single source of truth for switching days.
   */
  const jumpToDay = useCallback((targetDate: Date) => {
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    setCaptureTargetDate(target);
    setHeaderDate(target);
  }, []);

  /** Ask the recent-moments carousel to snap to `ymd`, paging the feed deeper
   *  if that day isn't loaded yet (see the effect that consumes it). */
  const requestCarouselScrollToDay = useCallback((ymd: string) => {
    carouselScrollPagesRef.current = 0;
    setPendingCarouselDay(ymd);
  }, []);

  useEffect(() => {
    if (!dayParam) return;
    if (onboardingFirstMomentParam === "1") return;
    const targetDate = parseCaptureDayYmd(dayParam);
    if (!targetDate) {
      router.setParams({ day: undefined });
      return;
    }
    jumpToDay(targetDate);
    // Move the picker carousel (and the page itself) to that day, not just the
    // header — this is what makes "jump to this day" from Capsule land on the
    // right moment instead of leaving the carousel where it was.
    requestCarouselScrollToDay(format(targetDate, "yyyy-MM-dd"));
    browseScrollRef.current?.scrollTo({ y: 0, animated: false });
    clearPinState();
    setLastSavedEntryId(null);
    setWantsNewMoment(true);
    router.setParams({ day: undefined });
  }, [
    dayParam,
    onboardingFirstMomentParam,
    clearPinState,
    jumpToDay,
    requestCarouselScrollToDay,
  ]);

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

  // Initial page of the continuous recent-moments feed (newest first).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const can = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!can) {
        // Permission not yet determined: keep the carousel in its loading
        // state and wait for the status to resolve. Settling `recentLoading`
        // to false here would let the carousel lock its one-time initial
        // scroll on the empty "today" slide before real media loads (e.g.
        // breaking the onboarding hand-off that should land on a recent day).
        if (permissionStatus == null) return;
        if (!cancelled) {
          setRecentMedia([]);
          setRecentCursor(null);
          setRecentHasMore(false);
          setRecentLoading(false);
        }
        return;
      }
      setRecentLoading(true);
      try {
        const page = await queryRecentCameraMediaPage({ pageSize: 24 });
        if (!cancelled) {
          setRecentMedia(page.assets);
          setRecentCursor(page.endCursor);
          setRecentHasMore(page.hasNextPage);
        }
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionStatus, accessPrivileges]);

  const loadMoreRecentMedia = useCallback(() => {
    if (recentLoadingMoreRef.current || !recentHasMore || !recentCursor) return;
    recentLoadingMoreRef.current = true;
    void (async () => {
      try {
        const page = await queryRecentCameraMediaPage({
          after: recentCursor,
          pageSize: 24,
        });
        setRecentMedia((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const merged = [...prev];
          for (const a of page.assets) if (!seen.has(a.id)) merged.push(a);
          return merged;
        });
        setRecentCursor(page.endCursor);
        setRecentHasMore(page.hasNextPage);
      } finally {
        recentLoadingMoreRef.current = false;
      }
    })();
  }, [recentCursor, recentHasMore]);

  /** Capture times (ms) of photos already turned into moments — used to hide
   *  duplicates from the recent-moments carousel. Mirrors the dedup the
   *  "Add more to this day" grid does, but across all days. */
  const usedPhotoTimes = useMemo(() => {
    const out: number[] = [];
    for (const e of entries) {
      if (e.entry_type !== "moment") continue;
      const takenAt = e.media?.find((m) => m.taken_at)?.taken_at;
      if (!takenAt) continue;
      const ms = new Date(takenAt).getTime();
      if (Number.isFinite(ms)) out.push(ms);
    }
    return out;
  }, [entries]);

  /** Feed slides: a synthetic "capture today" card first when today has no
   *  media, then every recent camera-roll item newest → oldest. Already-captured
   *  photos are filtered out so the picker never offers a duplicate. */
  const recentFeedItems = useMemo<RecentFeedItem[]>(() => {
    const todayY = format(new Date(), "yyyy-MM-dd");
    const available = recentMedia.filter(
      (a) =>
        !usedPhotoTimes.some((t) => Math.abs(t - a.creationTime) < 2000)
    );
    const firstIsToday =
      available.length > 0 &&
      format(new Date(available[0].creationTime), "yyyy-MM-dd") === todayY;
    const items: RecentFeedItem[] = [];
    if (!firstIsToday) items.push({ type: "today-empty", key: "today-empty" });
    for (const a of available) {
      items.push({ type: "media", key: `m-${a.id}`, asset: a });
    }
    return items;
  }, [recentMedia, usedPhotoTimes]);

  // Drive a requested day-jump on the carousel. If the day's slide is already
  // loaded, snap to it; otherwise page the feed deeper (bounded) and retry as
  // new pages arrive. Today always resolves via the synthetic "today" slide.
  useEffect(() => {
    if (!pendingCarouselDay) return;
    const todayY = format(new Date(), "yyyy-MM-dd");
    const found =
      pendingCarouselDay === todayY ||
      recentFeedItems.some(
        (it) =>
          it.type === "media" &&
          format(new Date(it.asset.creationTime), "yyyy-MM-dd") ===
            pendingCarouselDay
      );
    if (found) {
      const [y, m, d] = pendingCarouselDay.split("-").map(Number);
      carouselRef.current?.scrollToDay(new Date(y, m - 1, d));
      setPendingCarouselDay(null);
      return;
    }
    if (recentHasMore && carouselScrollPagesRef.current < 15) {
      carouselScrollPagesRef.current += 1;
      loadMoreRecentMedia();
      return;
    }
    // Day isn't in the camera roll (or too far back) — give up quietly; the
    // header still reflects the jump via `jumpToDay`.
    setPendingCarouselDay(null);
  }, [pendingCarouselDay, recentFeedItems, recentHasMore, loadMoreRecentMedia]);

  /** Initial carousel landing:
   *  - `?day=` deep link (Capsule) or onboarding handoff → the slide for that
   *    day (captured in a ref since the param is cleared shortly after mount),
   *  - onboarding with no exact match → the most-recent media item,
   *  - normal entry → the today slide (index 0). */
  const onboardingCarouselStart =
    onboardingFirstMomentParam === "1" || awaitingFirstOnboardingCapture;
  const initialCarouselDayRef = useRef<string | null>(dayParam ?? null);
  const carouselInitialIndex = useMemo(() => {
    const wantDay = initialCarouselDayRef.current;
    if (wantDay) {
      const idx = recentFeedItems.findIndex(
        (it) =>
          it.type === "media" &&
          format(new Date(it.asset.creationTime), "yyyy-MM-dd") === wantDay
      );
      if (idx >= 0) return idx;
    }
    if (onboardingCarouselStart) {
      const idx = recentFeedItems.findIndex((it) => it.type === "media");
      if (idx >= 0) return idx;
    }
    // Default: land on the slide for the current target day. This preserves
    // the user's place across the chat → save remount (the browse view, and
    // hence the carousel, unmounts while capturing) instead of snapping back
    // to the most-recent media.
    const targetYmd = format(captureTargetDate, "yyyy-MM-dd");
    const targetIdx = recentFeedItems.findIndex(
      (it) =>
        it.type === "media" &&
        format(new Date(it.asset.creationTime), "yyyy-MM-dd") === targetYmd
    );
    if (targetIdx >= 0) return targetIdx;
    return 0;
  }, [onboardingCarouselStart, recentFeedItems, captureTargetDate]);

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
      if (asset.mediaType === "video") {
        setVideoTrimAsset(asset);
        setVideoTrimDayDate(captureTargetDate);
        return;
      }
      commitPinnedPhoto(asset, captureTargetDate);
    },
    [captureTargetDate, commitPinnedPhoto]
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

  const handleSelectDayFromPicker = useCallback(
    (ymd: string) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const target = new Date(y, m - 1, d);
      jumpToDay(target);
      requestCarouselScrollToDay(ymd);
      browseScrollRef.current?.scrollTo({ y: 0, animated: false });
      clearPinState();
      setLastSavedEntryId(null);
      const hasMomentForDay = entries.some(
        (e) => e.entry_type === "moment" && e.entry_date === ymd
      );
      setWantsNewMoment(!hasMomentForDay);
      posthog.capture("capture_day_selected", { ymd, had_moment: hasMomentForDay });
    },
    [clearPinState, posthog, entries, jumpToDay, requestCarouselScrollToDay]
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

  // NOTE: the "minutes left to capture today" countdown now lives entirely
  // inside `YearCaptureProgressBlock` (a cheap leaf that ticks itself). It used
  // to be a 1-second `setState` here, which re-rendered the whole Capture page
  // — including the heavy below-fold sections — 60×/min and made scrolling
  // stutter.

  /** Drives the bar at the bottom of the day section and in the day picker. */
  const yearProgress = useMemo(() => yearCaptureProgress(entries), [entries]);

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
      if (asset.mediaType === "video") {
        setVideoTrimAsset(asset);
        setVideoTrimDayDate(dayDate);
        return;
      }
      commitPinnedPhoto(asset, dayDate);
    },
    [commitPinnedPhoto]
  );

  /** Launch the native camera (carousel today-empty slide + "Take a photo/video"
   *  CTA). Mirrors CaptureDaySection's handler, then pins onto today. */
  const handleCarouselCameraCapture = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9,
        videoMaxDuration: 2,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      const first = result.assets[0];
      const uri = first.uri;
      const isVideo =
        first.type === "video" || /\.(mov|mp4|m4v)$/i.test(uri ?? "");
      let savedId: string | null = null;
      try {
        const saved = await MediaLibrary.createAssetAsync(uri);
        savedId = saved.id;
      } catch {
        /* limited access — fall back to a synthetic id */
      }
      const asset: MediaAsset = {
        id: savedId ?? `cam-${Date.now()}`,
        uri,
        creationTime: Date.now(),
        mediaType: isVideo ? "video" : "photo",
        width: first.width ?? 0,
        height: first.height ?? 0,
      };
      const now = new Date();
      handlePinPhotoForDay(
        asset,
        new Date(now.getFullYear(), now.getMonth(), now.getDate())
      );
    } catch {
      /* swallow — user can retry */
    }
  }, [handlePinPhotoForDay]);

  /** Live header update as the carousel scrolls across days (cheap). */
  const handleCarouselActiveDay = useCallback((day: Date) => {
    setHeaderDate(day);
  }, []);

  /** Swipe settled — re-target the heavy per-day content below the carousel. */
  const handleCarouselSettleDay = useCallback((day: Date) => {
    setHeaderDate(day);
    setCaptureTargetDate(day);
  }, []);

  // The onboarding chat picked a moment and chose speaking or typing. Pin it
  // and drop straight into the caption flow — videos still route through the
  // trim editor first, which is why the method rides on a ref. Keyed off the
  // store rather than a route param: the chat hands over while we're already
  // the visible route, so there's no navigation to hang a param on. Consuming
  // the handoff empties it, which keeps this to one shot.
  useEffect(() => {
    if (!awaitingChatFirstCapture) return;
    const handoff = consumeFirstCaptureHandoff();
    if (!handoff) return;
    expectOnboardingFirstCaptureRef.current = true;
    setAwaitingFirstOnboardingCapture(true);
    pendingPhotoAutoStartRef.current = handoff.method;
    const taken = new Date(handoff.asset.creationTime);
    handlePinPhotoForDay(
      handoff.asset,
      new Date(taken.getFullYear(), taken.getMonth(), taken.getDate())
    );
  }, [awaitingChatFirstCapture, handlePinPhotoForDay]);

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
      // Onboarding: land on the target day but let the user explicitly tap
      // "Choose this moment" in the carousel. Never auto-select the first
      // asset or auto-open the video trim editor — even on single-item days,
      // and especially for videos which would otherwise jump straight into
      // edit mode without an explicit pick.
      jumpToDay(pinDay);
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
      if (asset.mediaType === "video") {
        handlePinPhotoForDay(asset, dayDate);
        return;
      }
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
    [handlePinPhotoForDay, posthog]
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
      voiceClip?: VoiceClip;
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

      if (entry.voiceClip && userId && saved?.id) {
        void attachVoiceNoteToEntry(userId, saved.id, entry.voiceClip);
      }

      if (entry.attachedPhotoUri && userId && saved?.id) {
        const entryId = saved.id;
        const takenAtIso = entry.attachedPhotoTakenAtMs
          ? new Date(entry.attachedPhotoTakenAtMs).toISOString()
          : null;
        const assetIdAtSave = photoAssetId;
        void (async () => {
          const row = await attachEntryMedia({
            userId,
            entryId,
            uri: entry.attachedPhotoUri!,
            assetId: assetIdAtSave,
            takenAtIso,
            onEnriched: () => {
              void fetchEntries(entryId);
            },
          });
          if (row) {
            await fetchEntries(entryId);
          }
          // Fire the rich success push only AFTER the entry_media row
          // is in place — the lifecycle handler reads `storage_url` to
          // populate the OneSignal `ios_attachments` / `big_picture`
          // image. Sending earlier would leave it without an image
          // since the local `file://` URI isn't reachable by the NSE.
          // Still send it when the photo failed: the moment itself saved,
          // and the attach is queued for retry.
          void notifyLifecycleEvent("moment_saved", { entry_id: entryId });
        })();
      } else if (saved?.id) {
        // Text-only save — no media to wait for.
        void notifyLifecycleEvent("moment_saved", { entry_id: saved.id });
      }

      await fetchEntries(saved?.id);

      // Animated transition back to the post-save Capture view: fade in + success haptic.
      // Flag the feed to auto-scroll down to the day's captured moments once it
      // re-renders, so the user sees what they just added.
      pendingScrollToCapturedRef.current = true;
      setBelowFoldUnlocked(true);
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

      if (saved?.id) {
        const entryId = saved.id;
        const chat = useFirstMomentChatStore.getState();
        if (totalMomentsBeforeSave === 0) {
          // Activation: their first moment ever is now saved.
          posthog.capture("onboarding_moment_captured", { entry_id: entryId });
        }
        // Either their first moment ever, or the one the chat sent them here to
        // capture. The second case can happen on an account that already has
        // moments (the dev launcher), so it can't lean on the count.
        if (totalMomentsBeforeSave === 0 || chat.awaitingFirstCaptureReturn) {
          chat.start(entryId);
        }
      }

      const newMomentCount = totalMomentsBeforeSave + 1;
      if (
        saved?.id &&
        profile?.subscription_status !== "active" &&
        shouldAutoShowPaywallAtCount(newMomentCount) &&
        newMomentCount !== lastPaywallShownAtCount
      ) {
        useSecondMomentPaywallStore.getState().markShownAtCount(newMomentCount);
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
      lastPaywallShownAtCount,
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
            showStreak={streaksEnabled}
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
                content={
                  streaksEnabled
                    ? `Nice work — that's ${streakDisplayed} day${streakDisplayed !== 1 ? "s" : ""} in a row. Your Capsule is growing. Where to next?`
                    : "Nice work — your Capsule is growing. Where to next?"
                }
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
      <CaptureTabTopBar />

      {!isPinnedForEllie ? (
        <Animated.ScrollView
          ref={browseScrollRef}
          style={{ flex: 1, opacity: postSaveOpacity }}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          scrollEventThrottle={32}
          onScroll={handleBrowseScroll}
        >
          <View
            style={{
              backgroundColor: colors.background,
              marginBottom: 18,
            }}
          >
            <CaptureBrowseHeading
              upperLabel={
                targetDayEntries.length > 0
                  ? "YOU CAPTURED"
                  : format(headerDate, "yyyy-MM-dd") ===
                      format(new Date(), "yyyy-MM-dd")
                    ? "CAPTURE TODAY!"
                    : "CAPTURING FOR"
              }
              title={format(headerDate, "EEE")}
              titleSecondary={format(headerDate, ", MMM d")}
              tickerKey={format(headerDate, "yyyy-MM-dd")}
              statsRow={
                <CaptureStatsCarousel
                  moments={momentCount}
                  chapters={chapterCount}
                  coreMemories={coreMemoryCount}
                  movies={movieCount}
                  threads={totalConnections}
                  currentStreak={streakCount}
                  streaksEnabled={streaksEnabled}
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
                  connectionsTabSeenAt={stats?.connections_tab_seen_at ?? null}
                  onAnswerSaved={updateThreadAnswerLocal}
                />
              ))}
            </View>
          ) : null}

          {hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges) ? (
            <View style={{ marginBottom: 8 }}>
              <CaptureSectionHeading
                title={
                  targetDayEntries.length > 0
                    ? `Capture another from ${format(captureTargetDate, "EEE")}`
                    : "Capture a little moment"
                }
                description="One photo or 2s of a video. Say or type a few words in under 60s to Capture the moment"
                style={{ marginTop: 18 }}
                singleLineTitle
              />
              <RecentMomentsCarousel
                ref={carouselRef}
                items={recentFeedItems}
                loading={recentLoading}
                initialIndex={carouselInitialIndex}
                onActiveDayChange={handleCarouselActiveDay}
                onSettleDay={handleCarouselSettleDay}
                onChoose={handlePinPhotoForDay}
                onCaptureWithCamera={handleCarouselCameraCapture}
                onEndReached={loadMoreRecentMedia}
              />
            </View>
          ) : null}

          <View
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              captureDaySectionYRef.current = y;
              tryScrollToPastSection();
              if (
                pendingScrollToCapturedRef.current &&
                targetDayEntries.length > 0
              ) {
                pendingScrollToCapturedRef.current = false;
                requestAnimationFrame(() => {
                  browseScrollRef.current?.scrollTo({
                    y: Math.max(0, y - 12),
                    animated: true,
                  });
                });
              }
            }}
          >
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
            monthWipProgress={monthWipProgress}
            onOpenMonthWip={(bucket) => {
              setChaptersView("grid");
              setOpenMashupKey(bucket.key);
              router.push("/(tabs)/chapters");
            }}
            magicFillOnboardingVariant={captureMagicFillOnboardingVariant}
            hidePicker={hasFullPhotoLibraryAccess(
              permissionStatus,
              accessPrivileges
            )}
            loadHeavySections={belowFoldUnlocked}
            onPastSectionLayout={(y) => {
              pastSectionInnerYRef.current = y;
              tryScrollToPastSection();
            }}
            magicFillBannerSlot={
              promoteMagicFillBanner &&
              hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges) ? (
                <MagicFillBanner
                  source="capture_banner"
                  gapCount={magicFillGapCount ?? undefined}
                  prominent
                />
              ) : null
            }
          />
          </View>

          {belowFoldUnlocked &&
          !promoteMagicFillBanner &&
          hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges) ? (
            <View style={{ marginTop: 20 }}>
              <MagicFillBanner
                source="capture_banner"
                gapCount={magicFillGapCount ?? undefined}
                prominent
              />
            </View>
          ) : null}

          {belowFoldUnlocked && profile?.subscription_status === "free" ? (
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

          {belowFoldUnlocked ? (
          <>
          {/* Year-captured nudge — lowest content in the scroll */}
          <View
            style={{
              marginTop: 28,
              paddingHorizontal: 20,
              marginBottom: 8,
            }}
          >
            <YearCaptureProgressBlock
              year={yearProgress.year}
              progress={yearProgress.ratio}
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

          <MadeByJarydBanner />
          </>
          ) : null}
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
                connectionsTabSeenAt={stats?.connections_tab_seen_at ?? null}
                onAnswerSaved={updateThreadAnswerLocal}
              />
            </View>
          )}
          {threads.map((thread) => (
            <View key={thread.id} style={{ marginBottom: 16 }}>
              <ThreadCard
                thread={thread}
                connectionsTabSeenAt={stats?.connections_tab_seen_at ?? null}
                onAnswerSaved={updateThreadAnswerLocal}
              />
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
          photoPreviewAsset={pinnedPreviewAsset}
          photoVideoClipStartSec={photoVideoClipStartSec}
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
          // Set for pinned questions, and for the photo the onboarding chat
          // handed over with an input method already chosen.
          autoStartInputMethod={questionAutoStart ?? undefined}
          onAbortFlow={() => {
            clearPinState();
            setTabBarHidden(false);
          }}
          skipPreview
        />
        </Animated.View>
      ) : null}


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
        yearProgress={yearProgress}
        magicFillGapCount={magicFillGapCount}
      />

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />

      <VideoTrimSheet
        visible={videoTrimAsset != null}
        asset={videoTrimAsset}
        onClose={() => {
          setVideoTrimAsset(null);
          setVideoTrimDayDate(null);
        }}
        onConfirm={({ asset, resolvedUri, clipStartSec }) => {
          const day = videoTrimDayDate ?? captureTargetDate;
          setVideoTrimAsset(null);
          setVideoTrimDayDate(null);
          commitPinnedPhoto(asset, day, { resolvedUri, clipStartSec });
        }}
      />

    </SafeAreaView>
  );
}
