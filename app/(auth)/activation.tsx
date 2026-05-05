import { EllieChatFlow } from "@/components/ellie/EllieChatFlow";
import type {
  InputMethod,
  MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { getDailyWord } from "@/constants/words";
import { useEntries } from "@/hooks/useEntries";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { useMediaLibrary, type PickedPhoto } from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { setActivationPhotoUri } from "@/lib/onboardingHandoff";
import {
  categorizePhotoBucket,
  photoAgeDays,
  photoYear,
  type PhotoBucket,
} from "@/lib/photoBucket";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/store/authStore";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import { router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ACTIVATION_PREVIEW_INSTRUCTION = `Here's a preview of your moment. Tap anywhere in the card to edit it.

If you're happy, tap "Add Moment" to save it!`;

export default function ActivationScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const setProfile = useAuthStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const { saveEntry, fetchEntries } = useEntries();
  const { checkPermission, requestPermission, getRandomAsset } =
    useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } =
    useFullPhotoAccessExplainer({ checkPermission, requestPermission });

  const params = useLocalSearchParams<{ prompt_type?: string }>();
  const promptType: "photo" | "word" = params.prompt_type === "word" ? "word" : "photo";

  const word = useMemo(() => getDailyWord(), []);
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [photoBucket, setPhotoBucket] = useState<PhotoBucket | undefined>();
  const [shuffleCount, setShuffleCount] = useState(0);
  const [isShufflingPhoto, setIsShufflingPhoto] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const inputMethodRef = useRef<InputMethod | null>(null);

  useEffect(() => {
    posthog.capture(
      "viewed_activation",
      onboardingEventProps(4, { prompt_type: promptType })
    );
  }, [promptType]);

  const applyPickedPhoto = useCallback(
    (photo: PickedPhoto, reason: "initial" | "shuffle") => {
      setPhotoUri(photo.asset.uri);
      setPhotoDate(photo.asset.creationTime);
      setPhotoBucket(photo.bucket);
      posthog.capture(
        "photo_shown",
        onboardingEventProps(4, {
          surface: "activation",
          reason,
          photo_bucket: photo.bucket,
          photo_age_days: photoAgeDays(photo.asset.creationTime),
          photo_year: photoYear(photo.asset.creationTime),
          selection_path: photo.selectionPath,
          shuffles_so_far: shuffleCount,
        })
      );
    },
    [posthog, shuffleCount]
  );

  // Photo path: load a random photo on mount.
  useEffect(() => {
    if (promptType !== "photo") return;
    let cancelled = false;
    void (async () => {
      const ok = await checkPermission();
      if (!ok || cancelled) return;
      const photo = await getRandomAsset();
      if (cancelled || !photo) return;
      applyPickedPhoto(photo, "initial");
    })();
    return () => {
      cancelled = true;
    };
  }, [promptType, checkPermission, getRandomAsset, applyPickedPhoto]);

  const handlePhotoShuffle = useCallback(async () => {
    setIsShufflingPhoto(true);
    setShuffleCount((c) => c + 1);
    posthog.capture(
      "photo_shuffled",
      onboardingEventProps(4, {
        surface: "activation",
        from_photo_bucket: photoBucket ?? null,
        from_photo_age_days: photoDate != null ? photoAgeDays(photoDate) : null,
        shuffles_so_far: shuffleCount + 1,
      })
    );
    try {
      const photo = await getRandomAsset();
      if (photo) {
        applyPickedPhoto(photo, "shuffle");
      }
    } finally {
      setIsShufflingPhoto(false);
    }
  }, [getRandomAsset, posthog, photoBucket, photoDate, shuffleCount, applyPickedPhoto]);

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
        word_of_day: promptType === "word" ? word : null,
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
        // Stash the local URI so the notifications-prompt screen can attach
        // it to the first-moment celebration push. The entry's `media` row
        // after upload only has the remote `storage_url`, which iOS
        // notification attachments won't accept.
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
            ...(promptType === "word"
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
          prompt_type: promptType,
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
    [saveEntry, fetchEntries, promptType, word, user, posthog, setProfile]
  );

  const handleSkipOnboarding = useCallback(async () => {
    posthog.capture(
      "activation_skipped",
      onboardingEventProps(4, { prompt_type: promptType })
    );
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "done" })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    }
    router.replace("/(tabs)/today");
  }, [posthog, promptType, user, setProfile]);

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
      <EllieChatFlow
        promptType={promptType}
        promptValue={promptType === "word" ? word : ""}
        photoUri={photoUri}
        photoDate={photoDate}
        photoBucket={photoBucket}
        shufflesBeforeSave={shuffleCount}
        isShufflingPhoto={isShufflingPhoto}
        onComplete={handleComplete}
        onPhotoShuffle={promptType === "photo" ? handlePhotoShuffle : undefined}
        photoFooterNote={
          promptType === "photo"
            ? "p.s if you want a different photo, tap shuffle."
            : undefined
        }
        previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
        analyticsSource="activation"
        ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
        onFlowStarted={(inputMethod) => {
          inputMethodRef.current = inputMethod;
          posthog.capture(
            "activation_initiated",
            onboardingEventProps(4, {
              input_method: inputMethod,
              prompt_type: promptType,
            })
          );
        }}
        onSkip={handleSkipOnboarding}
        skipLabel="Skip this"
        skipPreview
        hideHelperText
      />
    </SafeAreaView>
  );
}
