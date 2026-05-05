import { useCallback, useMemo, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { format } from "date-fns";
import { usePostHog } from "posthog-react-native";
import {
  EllieChatFlow,
  type InputMethod,
  type MomentCaptureAnalytics,
} from "@/components/ellie/EllieChatFlow";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";
import { useTabBarStore } from "@/store/tabBarStore";
import { useAuthStore } from "@/store/authStore";
import { uploadEntryMedia } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { CRASH_BURN_WORDS } from "@/constants/words";
import type { PromptType } from "@/lib/momentAssist";

type CaptureMode = "word" | "freetext";

function getRandomWord(): string {
  return CRASH_BURN_WORDS[Math.floor(Math.random() * CRASH_BURN_WORDS.length)];
}

const FREETEXT_GUIDANCE =
  "Think about little things — a conversation, a meal, something someone you love said to you. Not the big symbolic moments. The ones you'll forget.";

export default function CaptureModalScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const captureMode: CaptureMode = mode === "freetext" ? "freetext" : "word";

  const { colors } = useTheme();
  const posthog = usePostHog();
  const { saveEntry, fetchEntries } = useEntries();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const inputMethodRef = useRef<InputMethod | null>(null);

  const promptType: PromptType =
    captureMode === "word" ? "word" : "freetext";
  const promptValue = useMemo(
    () =>
      captureMode === "word"
        ? getRandomWord()
        : "What's the little moment you want to capture?",
    [captureMode]
  );

  const [saved, setSaved] = useState(false);

  const dismiss = useCallback(() => {
    setTabBarHidden(false);
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/today");
  }, [setTabBarHidden]);

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
      const result = await saveEntry({
        title: entry.title,
        body: entry.body,
        entry_type: "moment",
        entry_date: today,
        entry_month: new Date().getMonth() + 1,
        entry_year: new Date().getFullYear(),
        date_precision: "exact",
        word_of_day: captureMode === "word" ? promptValue : null,
        ai_conversation: null,
        ai_enhanced_body: null,
        original_body: entry.rawText,
        is_ai_enhanced: true,
        streak_day_number: null,
        chapter_id: null,
      });

      posthog.capture("moment_saved", {
        source: "capture_modal",
        prompt_type: promptType,
        input_method: inputMethodRef.current,
        ...entry.analytics,
      });

      if (entry.attachedPhotoUri && userId && result?.id) {
        const entryId = result.id;
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
              taken_at: entry.attachedPhotoTakenAtMs
                ? new Date(entry.attachedPhotoTakenAtMs).toISOString()
                : null,
            });
            await fetchEntries(entryId);
          } catch (err) {
            console.error("[CaptureModal] Failed to upload media:", err);
          }
        })();
      }

      await fetchEntries(result?.id);
      setSaved(true);
      setTabBarHidden(false);
      setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)/today");
      }, 600);
      return result ?? null;
    },
    [
      saveEntry,
      promptValue,
      captureMode,
      promptType,
      posthog,
      userId,
      fetchEntries,
      setTabBarHidden,
    ]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            dismiss();
          }}
          hitSlop={12}
          accessibilityLabel="Close"
          style={{
            width: 40,
            height: 40,
            borderRadius: 9999,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <EllieChatFlow
          promptType={promptType}
          promptValue={promptValue}
          onComplete={handleComplete}
          extraGuidance={
            captureMode === "freetext" ? FREETEXT_GUIDANCE : undefined
          }
          onFlowStarted={(inputMethod) => {
            inputMethodRef.current = inputMethod;
            posthog.capture("capture_modal_flow_started", {
              prompt_type: promptType,
              input_method: inputMethod,
              mode: captureMode,
            });
          }}
          onAbortFlow={() => {
            inputMethodRef.current = null;
          }}
          analyticsSource="add_tab"
          skipPreview
        />
      </View>
    </SafeAreaView>
  );
}
