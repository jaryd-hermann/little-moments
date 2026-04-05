import { ChoiceCards } from "@/components/ellie/ChoiceCards";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import { EllieChatFlow, type InputMethod } from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { CRASH_BURN_WORDS } from "@/constants/words";
import { useEntries } from "@/hooks/useEntries";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useStreak } from "@/hooks/useStreak";
import { useTheme } from "@/hooks/useTheme";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { shareInvite } from "@/lib/inviteShare";
import type { PromptType } from "@/lib/momentAssist";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Entry } from "@/store/entryStore";
import { useTabBarStore } from "@/store/tabBarStore";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { format } from "date-fns";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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

export default function AddScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { entries, saveEntry, fetchEntries } = useEntries();
  const { getRandomAsset, requestPermission } = useMediaLibrary();
  const { streakCount, totalMoments } = useStreak();
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
        const granted = await requestPermission();
        if (!granted) return;
        setPromptType("photo");
        setPromptValue("");
        setPhotoUri(undefined);
        setPhotoDate(undefined);
        setPhase("flow");
        getRandomAsset()
          .then((photo) => {
            if (photo) {
              setPhotoUri(photo.uri);
              setPhotoDate(photo.creationTime);
            }
          })
          .catch(() => {});
      } else {
        setPromptType("freetext");
        setPromptValue("What's the little moment you want to capture?");
        setPhase("flow");
      }
    },
    [getRandomAsset, requestPermission, posthog]
  );

  const handleFlowStarted = useCallback((inputMethod: InputMethod) => {
    inputMethodRef.current = inputMethod;
    posthog.capture("add_flow_started", {
      prompt_type: promptType,
      input_method: inputMethod,
    });
    setTabBarHidden(true);
  }, [setTabBarHidden, posthog, promptType]);

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
            await fetchEntries();
          } catch (err) {
            console.error("[AddScreen] Failed to upload media:", err);
          }
        })();
      }

      await fetchEntries();
    },
    [saveEntry, promptType, promptValue, posthog, isFirstTime, fetchEntries, userId]
  );

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

  // Build the afterSaveNode that will be injected into the chat after saving
  const afterSaveNode = (
    <View>
      <CongratsCard
        headline="Moment saved!"
        totalMoments={totalMoments + 1}
        streakCount={streakCount}
      />
      <EllieMessage
        content="Great job logging more moments. Your Capsule is growing and we're connecting more dots for you. Where to next?"
      />
      <View style={{ gap: 10, marginTop: 12 }}>
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
        <Pressable
          onPress={() => {
            setTabBarHidden(false);
            router.replace("/(tabs)/today");
          }}
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
      </View>
    </View>
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
        onPhotoShuffle={promptType === "photo" ? handlePhotoShuffle : undefined}
        onFlowStarted={handleFlowStarted}
        afterSaveNode={afterSaveNode}
        extraGuidance={
          promptType === "freetext"
            ? "Think about little things — a conversation, a meal, something someone you love said to you. Not the big symbolic moments. The ones you'll forget."
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
