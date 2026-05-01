import { ChoiceCards } from "@/components/ellie/ChoiceCards";
import { EllieChatFlow, type InputMethod } from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { CRASH_BURN_WORDS } from "@/constants/words";
import { useEntries } from "@/hooks/useEntries";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { type AfterSaveStats } from "@/hooks/useStreak";
import { useTheme } from "@/hooks/useTheme";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import type { PromptType } from "@/lib/momentAssist";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Entry } from "@/store/entryStore";
import { useCaptureIntentStore } from "@/store/captureIntentStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const REWIND_USED_KEY = "rewind_flow_used";

type AddPhase = "choose" | "flow" | "saved";

const CHOICES = [
  { id: "word", label: "Give me a word", subtitle: "A single word to unlock a memory", icon: "text-outline" as const },
  { id: "photo", label: "Show me a photo", subtitle: "A photo from your camera roll to talk about", icon: "image-outline" as const },
  { id: "freetext", label: "Add my own moment", subtitle: "Share any moment on your mind right now", icon: "chatbubble-outline" as const },
];

function getRandomWord(): string {
  return CRASH_BURN_WORDS[Math.floor(Math.random() * CRASH_BURN_WORDS.length)];
}

function photoAnalyticsProps(photoDate: number | undefined) {
  if (photoDate == null) return {};
  const ageDays = Math.floor((Date.now() - photoDate) / (1000 * 60 * 60 * 24));
  return {
    photo_creation_time: new Date(photoDate).toISOString(),
    photo_age_days: ageDays,
    photo_is_throwback: ageDays > 90,
  };
}

export default function AddScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries, saveEntry, fetchEntries } = useEntries();
  const {
    getRandomAsset,
    requestPermission,
    checkPermission,
    permissionStatus,
  } = useMediaLibrary();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const addResetTrigger = useTabBarStore((s) => s.addResetTrigger);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const [phase, setPhase] = useState<AddPhase>("choose");
  const [promptType, setPromptType] = useState<PromptType>("word");
  const [promptValue, setPromptValue] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [isShuffling, setIsShuffling] = useState(false);
  const [isFirstTime, setIsFirstTime] = useState(true);
  const mountedRef = useRef(false);
  const inputMethodRef = useRef<InputMethod | null>(null);
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);

  const savedEntry: Entry | null = useMemo(
    () => (lastSavedEntryId ? entries.find((e) => e.id === lastSavedEntryId) ?? null : null),
    [entries, lastSavedEntryId]
  );

  useEffect(() => {
    void AsyncStorage.getItem(REWIND_USED_KEY).then((val) => {
      if (val === "true") setIsFirstTime(false);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      posthog.capture("add_tab_opened");
      setPhase("choose");
      setPromptType("word");
      setPromptValue("");
      setPhotoUri(undefined);
      setPhotoDate(undefined);
      setIsShuffling(false);
      setTabBarHidden(false);
      setLastSavedEntryId(null);
      setShareModalVisible(false);
      inputMethodRef.current = null;

      // v3: if Capture home set an intent, auto-skip the choose step
      // and pre-fill the photo prompt.
      const intent = useCaptureIntentStore.getState().consumeIntent();
      if (intent && intent.source === "capture_home" && intent.photoUri) {
        setPromptType("photo");
        setPromptValue("");
        setPhotoUri(intent.photoUri);
        setPhotoDate(intent.photoDate);
        setPhase("flow");
      }
    }, [setTabBarHidden])
  );

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setPhase("choose");
    setPromptType("word");
    setPromptValue("");
    setPhotoUri(undefined);
    setPhotoDate(undefined);
    setIsShuffling(false);
    setTabBarHidden(false);
    setLastSavedEntryId(null);
    setShareModalVisible(false);
  }, [addResetTrigger, setTabBarHidden]);

  const handleChoice = useCallback(
    async (id: string) => {
      posthog.capture("add_tab_choice", { choice: id });

      if (id === "word") {
        setPromptType("word");
        setPromptValue(getRandomWord());
        setPhase("flow");
      } else if (id === "photo") {
        setPromptType("photo");
        setPromptValue("");
        setPhotoUri(undefined);
        setPhotoDate(undefined);
        setPhase("flow");
        const hasAccess = await checkPermission();
        if (hasAccess) {
          getRandomAsset()
            .then((photo) => {
              if (photo) {
                setPhotoUri(photo.uri);
                setPhotoDate(photo.creationTime);
              }
            })
            .catch(() => {});
        }
      } else {
        setPromptType("freetext");
        setPromptValue("What's the little moment you want to capture?");
        setPhase("flow");
      }
    },
    [getRandomAsset, checkPermission, posthog]
  );

  const handleFlowStarted = useCallback((inputMethod: InputMethod) => {
    inputMethodRef.current = inputMethod;
    posthog.capture("add_flow_started", {
      prompt_type: promptType,
      input_method: inputMethod,
      ...(promptType === "photo" ? photoAnalyticsProps(photoDate) : {}),
    });
    setTabBarHidden(true);
  }, [setTabBarHidden, posthog, promptType, photoDate]);

  const handleComplete = useCallback(
    async (entry: { title: string; body: string; rawText: string; attachedPhotoUri?: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      const saved = await saveEntry({
        title: entry.title,
        body: entry.body,
        entry_type: "moment",
        entry_date: today,
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: promptType === "word" ? promptValue : null,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: null,
        chapter_id: null,
      });

      if (saved?.id) setLastSavedEntryId(saved.id);

      posthog.capture("moment_saved", {
        source: "add_tab",
        prompt_type: promptType,
        input_method: inputMethodRef.current,
        ...(promptType === "photo" ? photoAnalyticsProps(photoDate) : {}),
      });

      if (isFirstTime) {
        void AsyncStorage.setItem(REWIND_USED_KEY, "true");
        setIsFirstTime(false);
      }

      setPhase("saved");

      if (entry.attachedPhotoUri && userId && saved?.id) {
        const entryId = saved.id;
        void (async () => {
          try {
            console.log("[AddScreen] Uploading attached photo...", entry.attachedPhotoUri!.substring(0, 60));
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
            console.log("[AddScreen] Photo uploaded and linked to entry");
            await fetchEntries(entryId);
          } catch (err) {
            console.error("[AddScreen] Failed to upload media:", err);
          }
        })();
      }

      await fetchEntries(saved?.id);
    },
    [saveEntry, promptType, promptValue, posthog, isFirstTime, fetchEntries, userId]
  );

  const handlePhotoShuffle = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("photo_shuffled", photoAnalyticsProps(photoDate));
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
  }, [getRandomAsset, posthog, photoDate]);

  const handleRequestPhotoAccess = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (permissionStatus === "denied") {
      Linking.openSettings();
      return;
    }
    const ok = await requestPermission();
    if (ok) {
      const photo = await getRandomAsset();
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
      }
    }
    await checkPermission();
  }, [
    permissionStatus,
    requestPermission,
    getRandomAsset,
    checkPermission,
  ]);

  const addPhotoPermissionBlocked =
    promptType === "photo" &&
    !photoUri &&
    (permissionStatus === "denied" || permissionStatus === "undetermined");

  const handleReturnToStart = useCallback(() => {
    setTabBarHidden(false);
    setPhase("choose");
    setPromptType("word");
    setPromptValue("");
    setPhotoUri(undefined);
    setPhotoDate(undefined);
  }, [setTabBarHidden]);

  const handleExitFlow = useCallback(() => {
    setTabBarHidden(false);
    setPhase("choose");
    setPromptType("word");
    setPromptValue("");
    setPhotoUri(undefined);
    setPhotoDate(undefined);
  }, [setTabBarHidden]);

  const afterSaveNode = useCallback(
    (_stats: AfterSaveStats) => {
      const goCaptureAnother = () => {
        setTabBarHidden(false);
        router.replace("/(tabs)/capture");
      };
      const goDigDeeper = () => {
        setTabBarHidden(false);
        if (lastSavedEntryId) {
          router.push(`/dig-deeper?entryId=${lastSavedEntryId}`);
        } else {
          router.push("/dig-deeper");
        }
      };

      const previewPhoto =
        photoUri ??
        savedEntry?.media?.[0]?.storage_url ??
        undefined;
      const previewTitle =
        savedEntry?.title ??
        (savedEntry?.body ? savedEntry.body.split("\n")[0].slice(0, 60) : "Moment saved");
      const previewBody =
        savedEntry?.ai_enhanced_body ??
        savedEntry?.body ??
        "";

      return (
        <View
          style={{
            marginTop: 4,
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ position: "relative", height: 380 }}>
            {previewPhoto ? (
              <Image
                source={{ uri: previewPhoto }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surfaceSecondary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="bookmark" size={48} color={colors.textMuted} />
              </View>
            )}

            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            />

            <Text
              style={{
                position: "absolute",
                top: 14,
                left: 16,
                fontFamily: "Roboto-Regular",
                fontSize: 11,
                color: "#FFFFFF",
                opacity: 0.85,
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Saved
            </Text>

            <View
              style={{
                position: "absolute",
                left: 18,
                right: 18,
                bottom: 18,
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontWeight: "700",
                  fontSize: 22,
                  color: "#FFFFFF",
                  marginBottom: 6,
                  textShadowColor: "rgba(0,0,0,0.4)",
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 4,
                }}
                numberOfLines={2}
              >
                {previewTitle}
              </Text>
              {previewBody ? (
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: "rgba(255,255,255,0.92)",
                    lineHeight: 19,
                    textShadowColor: "rgba(0,0,0,0.4)",
                    textShadowOffset: { width: 0, height: 1 },
                    textShadowRadius: 4,
                  }}
                  numberOfLines={3}
                >
                  {previewBody}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ padding: 16, gap: 10 }}>
            <Pressable
              onPress={goCaptureAnother}
              style={{
                height: 52,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons name="refresh" size={18} color="#1A1A1A" />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: "#1A1A1A",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                Capture another
              </Text>
            </Pressable>

            <Pressable
              onPress={goDigDeeper}
              style={{
                height: 46,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ionicons name="sparkles-outline" size={16} color={colors.text} />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 13,
                  color: colors.text,
                  letterSpacing: 0.3,
                }}
              >
                Dig deeper with Ellie
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShareModalVisible(true)}
              style={{
                marginTop: 4,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textDecorationLine: "underline",
                }}
              >
                Share this moment
              </Text>
            </Pressable>
          </View>
        </View>
      );
    },
    [colors, photoUri, savedEntry, lastSavedEntryId, setTabBarHidden]
  );

  if (phase === "choose") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingTop: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <EllieMessage
            content={
              isFirstTime
                ? "Welcome to Rewind! You can come here anytime outside of the daily prompt, and we'll help you notice old or recent moments in just 2 minutes.\n\nWhat kind of moment do you want to capture? Remember, 2 minutes only."
                : "What kind of moment do you want to capture? Remember, 2 minutes only."
            }
            showAvatar
          />
          <ChoiceCards choices={CHOICES} onSelect={handleChoice} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* X button to exit flow */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 4,
        }}
      >
        <Pressable
          onPress={handleExitFlow}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surfaceSecondary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={20} color={colors.icon} />
        </Pressable>
      </View>

      <EllieChatFlow
        promptType={promptType}
        promptValue={promptValue}
        photoUri={photoUri}
        photoDate={photoDate}
        isShufflingPhoto={isShuffling}
        onComplete={handleComplete}
        onPhotoShuffle={
          promptType === "photo" && !addPhotoPermissionBlocked
            ? handlePhotoShuffle
            : undefined
        }
        onFlowStarted={handleFlowStarted}
        afterSaveNode={afterSaveNode}
        extraGuidance={
          promptType === "freetext"
            ? "Think about little things — a conversation, a meal, something someone you love said to you. Not the big symbolic moments. The ones you'll forget."
            : undefined
        }
        photoPermissionBlocked={addPhotoPermissionBlocked}
        onRequestPhotoAccess={addPhotoPermissionBlocked ? handleRequestPhotoAccess : undefined}
        photoAccessButtonLabel={
          permissionStatus === "denied" ? "Open Settings" : "Grant photo access"
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
