import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import { EllieChatFlow } from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { MeetEllieCard } from "@/components/ellie/MeetEllieCard";
import { getDailyWord } from "@/constants/words";
import { useAuth } from "@/hooks/useAuth";
import { useEntries } from "@/hooks/useEntries";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useTheme } from "@/hooks/useTheme";
import { requestNotificationPermissions } from "@/lib/notifications";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/store/authStore";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { Ionicons } from "@expo/vector-icons";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { usePostHog } from "posthog-react-native";
import type { InputMethod } from "@/components/ellie/EllieChatFlow";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type ActivationPhase =
  | "word_flow"
  | "word_saved"
  | "photo_permission"
  | "photo_flow"
  | "photo_saved"
  | "notifications"
  | "prompt_offer"
  | "prompt_flow"
  | "prompt_saved"
  | "wrapup";

const CTA_LAVENDER = "#f0d7ff";
const NOTIFICATION_HERO = require("@/assets/images/notification.png");
const ACTIVATION_PROMPT = "What's a little moment from the past few days you'd tell someone at the dinner table?";
const ACTIVATION_PREVIEW_INSTRUCTION =
  "Here's a preview of your moment. Tap anywhere in the card to edit it, and tap \"Add Moment\" to capture it.";
const ACTIVATION_WORD_WELCOME_FIRST =
  "Welcome! Let's capture your first memory together — it only takes two minutes.";
const ACTIVATION_WORD_WELCOME_REST =
  "Read the word below and let it take you somewhere. What memory or association does this unlock?\n\nThere's no right or wrong! Just speak about an associated memory for max 2 minutes.";
const WORD_SAVED_PHOTO_OFFER_TYPING_MS = 5000;

export default function ActivationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { profile } = useAuth();
  const setProfile = useAuthStore((s) => s.setProfile);
  const user = useAuthStore((s) => s.user);
  const { saveEntry, fetchEntries } = useEntries();
  const setNotificationEnabled = useSettingsStore((s) => s.setNotificationEnabled);
  const {
    checkPermission,
    requestPermission,
    getRandomAsset,
  } = useMediaLibrary();

  const [phase, setPhase] = useState<ActivationPhase>("word_flow");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [momentCount, setMomentCount] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const completedPhotoRef = useRef(false);
  const completedPromptRef = useRef(false);
  const notificationsEnabledRef = useRef(false);
  /** Sync with latest photoUri for race-safe checks (concurrent getRandomAsset completions). */
  const photoUriRef = useRef<string | undefined>(undefined);
  const photoLoadGenerationRef = useRef(0);

  useEffect(() => {
    photoUriRef.current = photoUri;
  }, [photoUri]);

  useEffect(() => {
    posthog.capture("started_activation");
  }, []);

  const [wordSavedPhotoOfferVisible, setWordSavedPhotoOfferVisible] = useState(false);

  const word = getDailyWord();

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  }, []);

  useEffect(() => {
    if (phase !== "word_saved") {
      setWordSavedPhotoOfferVisible(false);
      return;
    }
    setWordSavedPhotoOfferVisible(false);
    const t = setTimeout(() => {
      setWordSavedPhotoOfferVisible(true);
      scrollToEnd();
    }, WORD_SAVED_PHOTO_OFFER_TYPING_MS);
    return () => clearTimeout(t);
  }, [phase, scrollToEnd]);

  const handleWordComplete = useCallback(
    async (entry: { title: string; body: string; rawText: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      await saveEntry({
        title: entry.title,
        body: entry.body,
        entry_type: "moment",
        entry_date: today,
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: word,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: 1,
        chapter_id: null,
      });

      if (user) {
        await supabase
          .from("profiles")
          .update({ activation_word_completed: true })
          .eq("id", user.id);
      }

      setMomentCount(1);
      posthog.capture("activation_word_saved");
      setPhase("word_saved");
    },
    [saveEntry, word, user, posthog]
  );

  const handlePhotoComplete = useCallback(
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
    }) => {
      const today = format(new Date(), "yyyy-MM-dd");
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
        streak_day_number: 1,
        chapter_id: null,
      });

      if (entry.attachedPhotoUri && user?.id && saved?.id) {
        try {
          const { publicUrl, storagePath } = await uploadEntryMedia(
            user.id,
            saved.id,
            entry.attachedPhotoUri,
            "image"
          );
          await supabase.from("entry_media").insert({
            entry_id: saved.id,
            user_id: user.id,
            storage_path: storagePath,
            storage_url: publicUrl,
            media_type: "image",
            display_order: 0,
          });
        } catch (err) {
          console.error("[Activation] Failed to upload media:", err);
        }
      }

      await fetchEntries();

      if (user) {
        await supabase
          .from("profiles")
          .update({ activation_photo_completed: true })
          .eq("id", user.id);
      }

      setMomentCount(2);
      completedPhotoRef.current = true;
      posthog.capture("activation_photo_saved");
      setPhase("photo_saved");
    },
    [saveEntry, fetchEntries, user, posthog]
  );

  const handlePromptComplete = useCallback(
    async (entry: { title: string; body: string; rawText: string }) => {
      const today = format(new Date(), "yyyy-MM-dd");
      await saveEntry({
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
        streak_day_number: 1,
        chapter_id: null,
      });

      setMomentCount(3);
      completedPromptRef.current = true;
      posthog.capture("activation_prompt_saved");
      setPhase("prompt_saved");
    },
    [saveEntry, posthog]
  );

  const handleRequestPhotoAccess = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const alreadyGranted = await checkPermission();

    const loadPhotoAndNavigate = async (navigate: boolean) => {
      const generation = ++photoLoadGenerationRef.current;
      if (navigate) {
        setPhase("photo_flow");
      }
      console.log("[Activation] loadPhoto: fetching random asset...");
      const photo = await getRandomAsset();
      console.log("[Activation] loadPhoto: got photo:", photo?.uri?.substring(0, 60) ?? "null");
      if (photo?.uri) {
        photoUriRef.current = photo.uri;
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
        if (!navigate) setPhase("photo_flow");
        return;
      }
      // Never leave photo_flow for a late/stale empty result — user already entered this step.
      // (Concurrent getRandomAsset calls used to fire setPhase("notifications") after a photo loaded.)
      if (!photoUriRef.current && generation === photoLoadGenerationRef.current) {
        setPhase((prev) => (prev === "photo_flow" ? prev : "notifications"));
      }
    };

    if (alreadyGranted) {
      await loadPhotoAndNavigate(true);
      return;
    }

    const granted = await requestPermission();
    if (granted) {
      await loadPhotoAndNavigate(true);
    } else {
      setPhase("notifications");
    }
  }, [checkPermission, requestPermission, getRandomAsset]);

  const handlePhotoShuffle = useCallback(async () => {
    const photo = await getRandomAsset();
    if (photo?.uri) {
      photoUriRef.current = photo.uri;
      setPhotoUri(photo.uri);
      setPhotoDate(photo.creationTime);
    }
  }, [getRandomAsset]);

  const handleNotification = useCallback(async (enable: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let granted = false;
    if (enable) {
      granted = await requestNotificationPermissions();
    }
    notificationsEnabledRef.current = granted;
    posthog.capture(granted ? "activation_notifications_allowed" : "activation_notifications_skipped");
    setNotificationEnabled(granted);

    if (user) {
      await supabase
        .from("profiles")
        .update({ notification_enabled: granted })
        .eq("id", user.id);
    }
    setPhase("prompt_offer");
    scrollToEnd();
  }, [user, posthog, setNotificationEnabled, scrollToEnd]);

  const handleFinish = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("activation_completed", {
      completed_photo: completedPhotoRef.current,
      completed_prompt: completedPromptRef.current,
      notifications_enabled: notificationsEnabledRef.current,
    });
    if (user) {
      await supabase
        .from("profiles")
        .update({
          onboarding_phase: "done",
          onboarding_completed: true,
          story_coach_enabled: true,
        })
        .eq("id", user.id);

      const { data: fresh } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (fresh) setProfile(fresh as Profile);
    }
    router.replace("/(tabs)/today");
  }, [user, setProfile]);

  // ── Word flow ──
  if (phase === "word_flow") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EllieChatFlow
          promptType="word"
          promptValue={word}
          onComplete={handleWordComplete}
          headerNode={<MeetEllieCard />}
          stagedWelcomeReveal={{
            firstMessage: ACTIVATION_WORD_WELCOME_FIRST,
            followingMessages: [ACTIVATION_WORD_WELCOME_REST],
            typingDurationMs: 5000,
          }}
          firstReplyOverride="Nice — Ellie pulled out a detail from what you shared. She does this to help you capture more of the moment. Here's a follow-up:"
          onFlowStarted={(inputMethod) => {
            posthog.capture("activation_initiated", { input_method: inputMethod });
          }}
          onSkip={handleFinish}
          hideTimerHint
          hideHelperText
          previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
        />
      </SafeAreaView>
    );
  }

  // ── Photo flow ──
  if (phase === "photo_flow") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EllieChatFlow
          promptType="photo"
          promptValue=""
          photoUri={photoUri}
          photoDate={photoDate}
          onComplete={handlePhotoComplete}
          onPhotoShuffle={handlePhotoShuffle}
          onSkip={handleFinish}
          timerHintOverride="You'll have 2 minutes again. When you're ready..."
          previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
          photoFooterNote="p.s If you want a different photo, tap shuffle."
          photoEllieTypingDelayMs={WORD_SAVED_PHOTO_OFFER_TYPING_MS}
        />
      </SafeAreaView>
    );
  }

  // ── Prompt flow ──
  if (phase === "prompt_flow") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <EllieChatFlow
          promptType="question"
          promptValue={ACTIVATION_PROMPT}
          onComplete={handlePromptComplete}
          welcomeMessages={["Last one. This time, just answer a simple question."]}
          extraGuidance="Think about little things — a conversation, a meal, something that happened on a walk. Not the big symbolic moments. The ones you'll forget."
          previewInstructionOverride={ACTIVATION_PREVIEW_INSTRUCTION}
        />
      </SafeAreaView>
    );
  }

  // ── Interstitial phases ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {/* ── After word saved ── */}
        {phase === "word_saved" && (
          <>
            <CongratsCard
              headline="Your first memory is saved!"
              totalMoments={1}
              streakCount={1}
              badge={{ label: "Story Starter earned", icon: "ribbon" }}
            />
            <EllieMessage
              content={"Over time, we'll turn these into beautiful chapters and send them to you — a real record of your life.\n\nEvery day you'll get a starting point — a word like you just did, a random photo from your camera roll, or a simple prompt."}
              showAvatar
            />
            {!wordSavedPhotoOfferVisible ? (
              <View style={{ marginTop: 8, marginLeft: 38 }}>
                <ThinkingDots />
              </View>
            ) : (
              <>
                <View
                  style={{
                    marginTop: 4,
                    marginBottom: 16,
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: "#F0D7FF",
                    padding: 20,
                    gap: 14,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 15,
                      lineHeight: 24,
                      color: colors.text,
                    }}
                  >
                    Let's try one more — <Text style={{ fontFamily: "Roboto-Bold" }}>this time with a photo.</Text>{"\n\n"}We'll show you a photo you took. You'll have two minutes max to talk about it.
                  </Text>
                  <Pressable
                    onPress={handleRequestPhotoAccess}
                    style={{
                      height: 52,
                      borderRadius: 9999,
                      backgroundColor: CTA_LAVENDER,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={ctaTextStyle}>Make first photo moment</Text>
                  </Pressable>
                  <Text
                    style={{
                      fontFamily: "Roboto-Light",
                      fontSize: 13,
                      color: colors.textMuted,
                      textAlign: "center",
                    }}
                  >
                    We <Text style={{ fontFamily: "Roboto-Bold", fontStyle: "italic" }}>never</Text> access and store all your device photos.
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    posthog.capture("activation_photo_skipped");
                    setPhase("notifications");
                  }}
                  style={{ height: 44, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontFamily: "Roboto-Light", fontSize: 14, color: colors.textMuted }}>
                    Skip for now
                  </Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── After photo saved ── */}
        {phase === "photo_saved" && (
          <>
            <CongratsCard
              headline="Photo memory saved!"
              totalMoments={2}
              streakCount={1}
              badge={{ label: "Photo Journalist earned", icon: "camera" }}
            />
            <EllieMessage
              content="Two memories captured already! Want a daily nudge so you don't forget tomorrow?"
              showAvatar
            />

            <NotificationCard
              colors={colors}
              onAllow={() => handleNotification(true)}
              onSkip={() => handleNotification(false)}
            />
          </>
        )}

        {/* ── Notifications (skipped photo path) ── */}
        {phase === "notifications" && (
          <>
            <EllieMessage
              content="Want a daily nudge so you don't forget to capture? A word, a photo, or a prompt — delivered right to you. You can always turn it off later."
              showAvatar
            />
            <NotificationCard
              colors={colors}
              onAllow={() => handleNotification(true)}
              onSkip={() => handleNotification(false)}
            />
          </>
        )}

        {/* ── Prompt offer ── */}
        {phase === "prompt_offer" && (
          <>
            <EllieMessage
              content="One last thing — want to try capturing a moment with just a question? It takes 2 minutes and walks you through the last way we help you remember."
              showAvatar
            />
            <View style={{ gap: 12, marginTop: 8 }}>
              <Pressable
                onPress={() => setPhase("prompt_flow")}
                style={{
                  height: 52,
                  borderRadius: 9999,
                  backgroundColor: CTA_LAVENDER,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={ctaTextStyle}>Let's do it</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  posthog.capture("activation_prompt_skipped");
                  handleFinish();
                }}
                style={{
                  height: 48,
                  borderRadius: 9999,
                  borderWidth: 2,
                  borderColor: "#F0D7FF",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontFamily: "Roboto-Medium", fontSize: 15, color: colors.text, letterSpacing: 0.5 }}>
                  Not now, explore the app
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {/* ── After prompt saved ── */}
        {phase === "prompt_saved" && (
          <>
            <CongratsCard
              headline="Three memories captured!"
              totalMoments={3}
              streakCount={1}
            />
            <EllieMessage
              content={"Amazing. You've already added three moments to your Capsule in just a few minutes here.\n\nThese are moments you'd likely have forgotten. Now you noticed and logged them.\n\nAfter a few more moments captured, I'll be able to start seeing threads between them. I'm excited to share those with you.\n\nCome back tomorrow — I'll have a new starting point ready for your 2 minute practice."}
              showAvatar
            />
            <Pressable
              onPress={handleFinish}
              style={{
                height: 52,
                borderRadius: 9999,
                backgroundColor: CTA_LAVENDER,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
              }}
            >
              <Text style={ctaTextStyle}>Explore the app</Text>
            </Pressable>
          </>
        )}

        {/* ── Wrapup (fallback) ── */}
        {phase === "wrapup" && (
          <>
            <EllieMessage
              content="You've captured your first memory. Come back tomorrow for your next starting point."
              showAvatar
            />
            <Pressable
              onPress={handleFinish}
              style={{
                height: 52,
                borderRadius: 9999,
                backgroundColor: CTA_LAVENDER,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 12,
              }}
            >
              <Text style={ctaTextStyle}>Explore the app</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ctaTextStyle = {
  fontFamily: "Roboto-Medium" as const,
  fontSize: 15,
  color: "#1A1A1A",
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
};

function NotificationCard({
  onAllow,
  onSkip,
}: {
  colors?: any;
  onAllow: () => void;
  onSkip: () => void;
}) {
  const INK = "#000000";
  const MUTED = "rgba(0, 0, 0, 0.45)";

  return (
    <View
      style={{
        marginBottom: 16,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: "#F0D7FF",
        backgroundColor: "#FFFFFF",
        padding: 24,
        alignItems: "center",
        gap: 16,
      }}
    >
      <Image
        source={NOTIFICATION_HERO}
        style={{ width: 200, height: 200 }}
        resizeMode="contain"
      />

      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 22,
          color: INK,
          textAlign: "center",
        }}
      >
        Get a daily reminder
      </Text>

      <View style={{ gap: 14, width: "100%" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="time-outline" size={20} color={MUTED} />
          <Text style={{ flex: 1, fontFamily: "Roboto-Regular", fontSize: 14, lineHeight: 20, color: INK }}>
            Gentle nudges from Ellie
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="book-outline" size={20} color={MUTED} />
          <Text style={{ flex: 1, fontFamily: "Roboto-Regular", fontSize: 14, lineHeight: 20, color: INK }}>
            Never miss new Chapters and Threads
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="refresh-outline" size={20} color={MUTED} />
          <Text style={{ flex: 1, fontFamily: "Roboto-Regular", fontSize: 14, lineHeight: 20, color: INK }}>
            Stay in the loop with new features
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onAllow}
        style={{
          width: "100%",
          height: 52,
          borderRadius: 9999,
          backgroundColor: CTA_LAVENDER,
          borderWidth: 2,
          borderColor: INK,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 4,
        }}
      >
        <Text style={{ fontFamily: "Roboto-Medium", fontSize: 15, color: INK }}>
          Enable notifications
        </Text>
      </Pressable>

      <Pressable onPress={onSkip} style={{ paddingVertical: 4 }}>
        <Text style={{ fontFamily: "Roboto-Light", fontSize: 14, color: MUTED, textAlign: "center" }}>
          Not now
        </Text>
      </Pressable>
    </View>
  );
}
