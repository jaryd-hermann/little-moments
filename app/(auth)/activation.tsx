import { EllieChatFlow } from "@/components/ellie/EllieChatFlow";
import type {
  InputMethod,
  MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { getDailyWord } from "@/constants/words";
import { CaptureBrowseHeading } from "@/components/capture/CaptureBrowseHeading";
import {
  RecentMomentsCarousel,
  type RecentFeedItem,
} from "@/components/capture/RecentMomentsCarousel";
import { useEntries } from "@/hooks/useEntries";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import {
  hasFullPhotoLibraryAccess,
  queryRecentCameraMediaPage,
  useMediaLibrary,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useTheme } from "@/hooks/useTheme";
import { PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { setActivationPhotoUri } from "@/lib/onboardingHandoff";
import type { ReflectionQuestionItem } from "@/lib/captureReflectionQuestions";
import { REFLECTION_QUESTIONS } from "@/lib/captureReflectionQuestions";
import {
  calendarDateForReflectionTarget,
  captureScreenHeading,
} from "@/lib/reflectionTarget";
import {
  categorizePhotoBucket,
  photoAgeDays,
  type PhotoBucket,
} from "@/lib/photoBucket";
import { attachEntryMedia } from "@/lib/attachEntryMedia";
import { attachVoiceNoteToEntry } from "@/lib/entryVoiceNote";
import type { VoiceClip } from "@/components/composer/MicRecorder";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/store/authStore";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACTIVATION_PREVIEW_INSTRUCTION = `Here's a preview of your moment. Tap anywhere in the card to edit it.

If you're happy, tap "Add Moment" to save it!`;

export default function ActivationScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const setProfile = useAuthStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const { saveEntry, fetchEntries } = useEntries();
  const { checkPermission, requestPermission, permissionStatus, accessPrivileges } =
    useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } =
    useFullPhotoAccessExplainer({ checkPermission, requestPermission });

  const params = useLocalSearchParams<{ prompt_type?: string }>();
  const promptTypeParam: "photo" | "word" =
    params.prompt_type === "word" ? "word" : "photo";

  const word = useMemo(() => getDailyWord(), []);

  const captureTargetDate = useMemo(
    () => calendarDateForReflectionTarget("yesterday"),
    []
  );
  const captureHeading = useMemo(
    () => captureScreenHeading(captureTargetDate),
    [captureTargetDate]
  );
  const memoryYmd = useMemo(
    () => format(captureTargetDate, "yyyy-MM-dd"),
    [captureTargetDate]
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
  // Continuous recent-moments feed (replaces the single-day picker so users
  // aren't stuck on one day with no good photo).
  const [recentMedia, setRecentMedia] = useState<MediaAsset[]>([]);
  const [recentCursor, setRecentCursor] = useState<string | null>(null);
  const [recentHasMore, setRecentHasMore] = useState(true);
  // Starts true so the carousel's initial scroll waits for the feed before
  // landing on the most-recent media item.
  const [recentLoading, setRecentLoading] = useState(true);
  const recentLoadingMoreRef = useRef(false);
  const [headerDate, setHeaderDate] = useState<Date>(captureTargetDate);
  /** Calendar day of the chosen photo — entry is saved against this day. */
  const [pinnedDayDate, setPinnedDayDate] = useState<Date>(captureTargetDate);

  const flowPromptType =
    promptTypeParam === "word" ? "word" : pinnedQuestion ? "question" : "photo";
  const effectivePromptValue =
    promptTypeParam === "word" ? word : pinnedQuestion ? pinnedQuestion.prompt : "";

  const isPinnedForEllie =
    promptTypeParam === "word" ||
    pinnedQuestion != null ||
    (photoUri != null && photoDate != null);

  const startedAtRef = useRef<number>(Date.now());
  const inputMethodRef = useRef<InputMethod | null>(null);
  const elliePhotoEnterOpacity = useRef(new Animated.Value(1)).current;
  const capturePhotoEllieEnteredRef = useRef(false);

  useEffect(() => {
    if (!isPinnedForEllie || promptTypeParam === "word") {
      capturePhotoEllieEnteredRef.current = false;
      elliePhotoEnterOpacity.setValue(1);
      return;
    }
    if (flowPromptType !== "photo") {
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
  }, [isPinnedForEllie, promptTypeParam, flowPromptType, elliePhotoEnterOpacity]);

  useEffect(() => {
    posthog.capture(
      "viewed_activation",
      onboardingEventProps(4, { prompt_type: promptTypeParam })
    );
  }, [promptTypeParam]);

  useEffect(() => {
    if (promptTypeParam !== "photo") return;
    let cancelled = false;
    void (async () => {
      const can = hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);
      if (!can) {
        // Permission not yet determined: stay in the loading state so the
        // carousel doesn't lock its initial scroll on the empty slide before
        // real media loads.
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
          posthog.capture(
            "photo_carousel_viewed",
            onboardingEventProps(4, {
              target_ymd: memoryYmd,
              photo_count: page.assets.length,
              surface: "activation",
            })
          );
        }
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    promptTypeParam,
    permissionStatus,
    accessPrivileges,
    memoryYmd,
    posthog,
  ]);

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

  const recentFeedItems = useMemo<RecentFeedItem[]>(() => {
    const todayY = format(new Date(), "yyyy-MM-dd");
    const firstIsToday =
      recentMedia.length > 0 &&
      format(new Date(recentMedia[0].creationTime), "yyyy-MM-dd") === todayY;
    const items: RecentFeedItem[] = [];
    if (!firstIsToday) items.push({ type: "today-empty", key: "today-empty" });
    for (const a of recentMedia) {
      items.push({ type: "media", key: `m-${a.id}`, asset: a });
    }
    return items;
  }, [recentMedia]);

  // Onboarding starts on the most-recent media item.
  const carouselInitialIndex = useMemo(() => {
    const idx = recentFeedItems.findIndex((it) => it.type === "media");
    return idx >= 0 ? idx : 0;
  }, [recentFeedItems]);

  const clearPinState = useCallback(() => {
    setPhotoUri(undefined);
    setPhotoDate(undefined);
    setPhotoBucket(undefined);
    setPinnedQuestion(null);
    setShuffleCount(0);
    setQuestionAutoStart(null);
    inputMethodRef.current = null;
  }, []);

  const handlePinPhotoFromBrowse = useCallback(
    (asset: MediaAsset, dayDate: Date) => {
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      setPhotoUri(asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setPinnedDayDate(dayDate);
      setShuffleCount(0);
      posthog.capture(
        "photo_pinned",
        onboardingEventProps(4, {
          surface: "activation",
          target_ymd: format(dayDate, "yyyy-MM-dd"),
          photo_bucket: bucket,
        })
      );
    },
    [posthog]
  );

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
        /* limited access — synthetic id */
      }
      const now = new Date();
      const asset: MediaAsset = {
        id: savedId ?? `cam-${Date.now()}`,
        uri,
        creationTime: now.getTime(),
        mediaType: isVideo ? "video" : "photo",
        width: first.width ?? 0,
        height: first.height ?? 0,
      };
      handlePinPhotoFromBrowse(
        asset,
        new Date(now.getFullYear(), now.getMonth(), now.getDate())
      );
    } catch {
      /* swallow */
    }
  }, [handlePinPhotoFromBrowse]);

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
      const now = new Date();
      const mem = promptTypeParam === "word" ? now : pinnedDayDate;
      const entryYmd =
        promptTypeParam === "word"
          ? format(now, "yyyy-MM-dd")
          : format(pinnedDayDate, "yyyy-MM-dd");
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
        entry_date: entryYmd,
        entry_month: mem.getMonth() + 1,
        entry_year: mem.getFullYear(),
        date_precision: "exact",
        word_of_day: promptTypeParam === "word" ? word : null,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: 1,
        chapter_id: null,
        photo_bucket_at_save: photoBucketAtSave,
        photo_age_days_at_save: photoAgeDaysAtSave,
      });

      if (entry.voiceClip && user?.id && saved?.id) {
        void attachVoiceNoteToEntry(user.id, saved.id, entry.voiceClip);
      }

      if (entry.attachedPhotoUri && user?.id && saved?.id) {
        setActivationPhotoUri(entry.attachedPhotoUri);
        const entryId = saved.id;
        const takenAtIso = entry.attachedPhotoTakenAtMs
          ? new Date(entry.attachedPhotoTakenAtMs).toISOString()
          : null;
        await attachEntryMedia({
          userId: user.id,
          entryId,
          uri: entry.attachedPhotoUri,
          takenAtIso,
        });
      }

      await fetchEntries(saved?.id);

      if (user) {
        await supabase
          .from("profiles")
          .update({
            ...(promptTypeParam === "word"
              ? { activation_word_completed: true }
              : { activation_photo_completed: true }),
            onboarding_phase: "reveal",
          })
          .eq("id", user.id);
        const { data: fresh } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (fresh) setProfile(fresh as Profile);
      }

      const msToSave = Math.max(0, Date.now() - startedAtRef.current);
      posthog.capture(
        "activation_saved",
        onboardingEventProps(4, {
          prompt_type: promptTypeParam,
          input_method: inputMethodRef.current,
          ms_to_save: msToSave,
          ...entry.analytics,
        })
      );

      router.replace({
        pathname: "/(auth)/reveal",
        params: saved?.id ? { entryId: saved.id } : undefined,
      });

      return saved ?? null;
    },
    [
      saveEntry,
      fetchEntries,
      promptTypeParam,
      word,
      user,
      posthog,
      setProfile,
      pinnedDayDate,
    ]
  );

  /**
   * Activation off-ramp. The user is stuck or doesn't want to capture
   * right now — but we don't want to drop them all the way out of the
   * onboarding funnel, because notifications + value-anchor (paywall)
   * are the steps that actually move retention and trial-start. Skip
   * past activation + reveal and land them on the notifications screen.
   */
  const handleSkipOnboarding = useCallback(async () => {
    posthog.capture(
      "activation_skipped",
      onboardingEventProps(4, { prompt_type: promptTypeParam })
    );
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "notifications" })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    }
    router.replace("/(auth)/notifications-prompt");
  }, [posthog, promptTypeParam, user, setProfile]);

  const todayPhotoPermissionBlocked =
    flowPromptType === "photo" &&
    !photoUri &&
    !hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);

  const handleRequestPhotoAccess = useCallback(async () => {
    await ensureFullPhotoAccess();
    await checkPermission();
  }, [ensureFullPhotoAccess, checkPermission]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      {fullPhotoAccessModal}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 2,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: colors.text,
          }}
        >
          Capture your first moment
        </Text>
      </View>

      {promptTypeParam === "word" ? (
        <EllieChatFlow
          promptType="word"
          promptValue={word}
          shufflesBeforeSave={shuffleCount}
          onComplete={handleComplete}
          previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
          analyticsSource="activation"
          ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
          onFlowStarted={(inputMethod) => {
            inputMethodRef.current = inputMethod;
            posthog.capture(
              "activation_initiated",
              onboardingEventProps(4, {
                input_method: inputMethod,
                prompt_type: "word",
              })
            );
          }}
          onSkip={handleSkipOnboarding}
          skipLabel="Skip this"
          skipPreview
          hideHelperText
        />
      ) : isPinnedForEllie ? (
        <Animated.View style={{ flex: 1, opacity: elliePhotoEnterOpacity }}>
        <EllieChatFlow
          promptType={flowPromptType === "question" ? "question" : "photo"}
          promptValue={effectivePromptValue}
          photoUri={photoUri}
          photoDate={photoDate}
          photoBucket={photoBucket}
          shufflesBeforeSave={shuffleCount}
          isShufflingPhoto={false}
          onComplete={handleComplete}
          onPhotoShuffle={undefined}
          photoPermissionBlocked={todayPhotoPermissionBlocked}
          onRequestPhotoAccess={
            todayPhotoPermissionBlocked ? handleRequestPhotoAccess : undefined
          }
          photoAccessButtonLabel={
            permissionStatus === "denied" || accessPrivileges === "limited"
              ? "OPEN SETTINGS"
              : "CONTINUE"
          }
          previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
          analyticsSource="activation"
          ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
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
                hideChangeDay
                topLeftAction={{ label: "Go back", onPress: clearPinState }}
              />
            </View>
          }
          onFlowStarted={(inputMethod) => {
            inputMethodRef.current = inputMethod;
            posthog.capture(
              "activation_initiated",
              onboardingEventProps(4, {
                input_method: inputMethod,
                prompt_type: flowPromptType,
              })
            );
          }}
          onAbortFlow={clearPinState}
          autoStartInputMethod={
            pinnedQuestion && questionAutoStart
              ? questionAutoStart
              : undefined
          }
          onSkip={handleSkipOnboarding}
          skipLabel="Skip this"
          skipPreview
          hideHelperText
          hideTimerHint={flowPromptType === "photo"}
        />
        </Animated.View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ marginTop: 8 }}>
              <CaptureBrowseHeading
                upperLabel="CAPTURING FOR"
                title={format(headerDate, "EEE")}
                titleSecondary={format(headerDate, ", MMM d")}
                tickerKey={format(headerDate, "yyyy-MM-dd")}
                hideChangeDay
              />
            </View>
            <RecentMomentsCarousel
              items={recentFeedItems}
              loading={recentLoading}
              initialIndex={carouselInitialIndex}
              onActiveDayChange={setHeaderDate}
              onSettleDay={setHeaderDate}
              onChoose={handlePinPhotoFromBrowse}
              onCaptureWithCamera={() => void handleCarouselCameraCapture()}
              onEndReached={loadMoreRecentMedia}
            />
          </ScrollView>
          {/*
            Off-ramp link, always visible at the bottom of the browse
            panel. Tapping it sets phase = "notifications" and jumps the
            user past activation + reveal to the notifications screen so
            they don't get stuck on this step.
          */}
          <View
            style={{
              paddingHorizontal: 24,
              paddingTop: 8,
              paddingBottom: 16,
              backgroundColor: colors.background,
              borderTopWidth: 1,
              borderTopColor: colors.borderLight,
            }}
          >
            <Pressable
              accessibilityLabel="Skip for now"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void handleSkipOnboarding();
              }}
              hitSlop={8}
              style={{ paddingVertical: 10 }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: colors.text,
                  textAlign: "center",
                  textDecorationLine: "underline",
                }}
              >
                Skip for now
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
