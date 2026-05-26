import { EllieChatFlow } from "@/components/ellie/EllieChatFlow";
import type {
  InputMethod,
  MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { getDailyWord } from "@/constants/words";
import { CaptureBrowseHeading } from "@/components/capture/CaptureBrowseHeading";
import { CuratorBrowsePanel } from "@/components/capture/CuratorBrowsePanel";
import { useEntries } from "@/hooks/useEntries";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import {
  hasFullPhotoLibraryAccess,
  queryCameraPhotosForLocalDay,
  useMediaLibrary,
  type MediaAsset,
} from "@/hooks/useMediaLibrary";
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
import { uploadEntryMedia } from "@/lib/storage";
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
  const [dayPhotos, setDayPhotos] = useState<MediaAsset[]>([]);
  const [loadingDayPhotos, setLoadingDayPhotos] = useState(false);

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
          posthog.capture(
            "photo_carousel_viewed",
            onboardingEventProps(4, {
              target_ymd: memoryYmd,
              photo_count: list.length,
              surface: "activation",
            })
          );
        }
      } finally {
        if (!cancelled) setLoadingDayPhotos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    promptTypeParam,
    captureTargetDate,
    permissionStatus,
    accessPrivileges,
    memoryYmd,
    posthog,
  ]);

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
    (asset: MediaAsset) => {
      const bucket = categorizePhotoBucket(asset.creationTime);
      setPinnedQuestion(null);
      setQuestionAutoStart(null);
      setPhotoUri(asset.uri);
      setPhotoDate(asset.creationTime);
      setPhotoBucket(bucket);
      setShuffleCount(0);
      posthog.capture(
        "photo_pinned",
        onboardingEventProps(4, {
          surface: "activation",
          target_ymd: memoryYmd,
          photo_bucket: bucket,
        })
      );
    },
    [posthog, memoryYmd]
  );

  const handleStartQuestionFromBrowse = useCallback(
    (q: ReflectionQuestionItem, method: "speaking" | "typing") => {
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setPhotoBucket(undefined);
      setPinnedQuestion(q);
      setShuffleCount(0);
      setQuestionAutoStart(method);
      posthog.capture(
        "question_pinned",
        onboardingEventProps(4, {
          surface: "activation",
          question_id: q.id,
          target_ymd: memoryYmd,
          input_method: method,
        })
      );
    },
    [posthog, memoryYmd]
  );

  const handleComplete = useCallback(
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      attachedPhotoTakenAtMs?: number;
      analytics?: MomentCaptureAnalytics;
    }) => {
      const now = new Date();
      const mem = promptTypeParam === "word" ? now : captureTargetDate;
      const entryYmd =
        promptTypeParam === "word"
          ? format(now, "yyyy-MM-dd")
          : format(captureTargetDate, "yyyy-MM-dd");
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

      if (entry.attachedPhotoUri && user?.id && saved?.id) {
        setActivationPhotoUri(entry.attachedPhotoUri);
        const entryId = saved.id;
        const takenAtIso = entry.attachedPhotoTakenAtMs
          ? new Date(entry.attachedPhotoTakenAtMs).toISOString()
          : null;
        try {
          const { publicUrl, storagePath } = await uploadEntryMedia(
            user.id,
            entryId,
            entry.attachedPhotoUri,
            "image"
          );
          await supabase.from("entry_media").insert({
            entry_id: entryId,
            user_id: user.id,
            storage_path: storagePath,
            storage_url: publicUrl,
            media_type: "image",
            display_order: 0,
            taken_at: takenAtIso,
          });
        } catch (err) {
          console.error("[Activation] Failed to upload media:", err);
        }
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
      captureTargetDate,
    ]
  );

  const handleSkipOnboarding = useCallback(async () => {
    posthog.capture(
      "activation_skipped",
      onboardingEventProps(4, { prompt_type: promptTypeParam })
    );
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "done", onboarding_completed: true })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    }
    router.replace("/(tabs)/today");
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <CuratorBrowsePanel
            key={memoryYmd}
            headingTitle={captureHeading.title}
            onPressChangeDay={() => {}}
            dayPhotos={dayPhotos}
            loadingPhotos={loadingDayPhotos}
            onChoosePhoto={handlePinPhotoFromBrowse}
            onStartQuestionCapture={handleStartQuestionFromBrowse}
            hideChangeDay
            analyticsContext={{
              target_ymd: memoryYmd,
              surface: "activation",
            }}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
