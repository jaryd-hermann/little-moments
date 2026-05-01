import { PremiumInlineCard } from "@/components/common/PremiumInlineCard";
import { ShareMomentModal } from "@/components/common/ShareMomentModal";
import { ChoiceCards } from "@/components/ellie/ChoiceCards";
import { CongratsCard } from "@/components/ellie/CongratsCard";
import { EllieChatFlow, type InputMethod } from "@/components/ellie/EllieChatFlow";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { CRASH_BURN_WORDS } from "@/constants/words";
import { useAuth } from "@/hooks/useAuth";
import { useEntries } from "@/hooks/useEntries";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { hasFullPhotoLibraryAccess, useMediaLibrary } from "@/hooks/useMediaLibrary";
import {
  type AfterSaveStats,
  type AfterSaveContext,
} from "@/hooks/useStreak";
import { SlideToPinMoment } from "@/components/common/SlideToPinMoment";
import { useTheme } from "@/hooks/useTheme";
import { useThreads } from "@/hooks/useThreads";
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
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { router, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const REWIND_USED_KEY = "rewind_flow_used";

type AddPhase = "choose" | "flow" | "saved";

/** Add-tab photo flows only: random roll vs user-picked from gallery first. */
type AddTabPhotoMode = "random" | "library";

const CHOICES = [
  { id: "word", label: "Give me a random word", subtitle: "A single word to unlock a memory", icon: "text-outline" as const },
  {
    id: "photo",
    label: "Show me a photo I took",
    subtitle: "Add stories to your photos for a richer album",
    icon: "image-outline" as const,
  },
  {
    id: "photo_pick",
    label: "Choose my own photo",
    subtitle: "Pick any picture, then tell the story behind it",
    icon: "camera-outline" as const,
  },
  { id: "freetext", label: "Add my own moment", subtitle: "Share any moment on your mind right now", icon: "chatbubble-outline" as const },
];

async function pickPhotoFromLibrary(): Promise<{ uri: string; creationTime?: number } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      "Photo access needed",
      "Allow photo library access to choose a picture for this moment.",
      perm.canAskAgain === false
        ? [
            { text: "Not now", style: "cancel" as const },
            { text: "Open Settings", onPress: () => void Linking.openSettings() },
          ]
        : [{ text: "OK" }],
    );
    return null;
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return null;
    const asset = result.assets[0];
    const uri = asset.uri;
    let creationTime: number | undefined;
    if (asset.assetId) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        if (typeof info.creationTime === "number") {
          creationTime = info.creationTime;
        }
      } catch {
        // Date badge optional when metadata is unavailable
      }
    }
    return { uri, creationTime };
  } catch (err) {
    console.error("[AddScreen] Gallery error:", err);
    Alert.alert("Could not open photos", "Try again or pick a different image.");
    return null;
  }
}

function getRandomWord(): string {
  return CRASH_BURN_WORDS[Math.floor(Math.random() * CRASH_BURN_WORDS.length)];
}

export default function AddScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const { profile } = useAuth();
  const { entries, saveEntry, fetchEntries } = useEntries();
  const {
    getRandomAsset,
    requestPermission,
    checkPermission,
    permissionStatus,
    accessPrivileges,
  } = useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } = useFullPhotoAccessExplainer({
    checkPermission,
    requestPermission,
  });
  const { totalConnections } = useThreads();
  const setTabBarHidden = useTabBarStore((s) => s.setTabBarHidden);
  const addResetTrigger = useTabBarStore((s) => s.addResetTrigger);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const subscriptionStatus = useAuthStore((s) => s.profile?.subscription_status);

  const hasRealName =
    !!profile?.display_name?.trim() &&
    profile.display_name.trim() !== profile.email;
  const firstName = hasRealName
    ? profile!.display_name!.trim().split(/\s+/)[0]
    : null;

  const [phase, setPhase] = useState<AddPhase>("choose");
  const [promptType, setPromptType] = useState<PromptType>("word");
  const [promptValue, setPromptValue] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [photoDate, setPhotoDate] = useState<number | undefined>();
  const [addTabPhotoMode, setAddTabPhotoMode] = useState<AddTabPhotoMode | null>(null);
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
      setAddTabPhotoMode(null);
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
    setAddTabPhotoMode(null);
    setIsShuffling(false);
    setTabBarHidden(false);
    setLastSavedEntryId(null);
    setShareModalVisible(false);
  }, [addResetTrigger, setTabBarHidden]);

  const handleChoice = useCallback(
    async (id: string) => {
      posthog.capture("add_tab_choice", { choice: id });

      if (id === "word") {
        setAddTabPhotoMode(null);
        setPromptType("word");
        setPromptValue(getRandomWord());
        setPhase("flow");
      } else if (id === "photo") {
        setAddTabPhotoMode("random");
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
      } else if (id === "photo_pick") {
        const ok = await ensureFullPhotoAccess();
        if (!ok) return;
        const picked = await pickPhotoFromLibrary();
        if (!picked) return;
        setAddTabPhotoMode("library");
        setPromptType("photo");
        setPromptValue("");
        setPhotoUri(picked.uri);
        setPhotoDate(picked.creationTime);
        setPhase("flow");
      } else {
        setAddTabPhotoMode(null);
        setPromptType("freetext");
        setPromptValue("What's the little moment you want to capture?");
        setPhase("flow");
      }
    },
    [getRandomAsset, checkPermission, posthog, ensureFullPhotoAccess]
  );

  const handleFlowStarted = useCallback((inputMethod: InputMethod) => {
    inputMethodRef.current = inputMethod;
    posthog.capture("add_flow_started", {
      prompt_type: promptType,
      input_method: inputMethod,
      ...(promptType === "photo" && addTabPhotoMode
        ? { photo_add_mode: addTabPhotoMode }
        : {}),
    });
    setTabBarHidden(true);
  }, [setTabBarHidden, posthog, promptType, addTabPhotoMode]);

  const handleComplete = useCallback(
    async (entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      analytics?: any;
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
        ...(promptType === "photo" && addTabPhotoMode
          ? { photo_add_mode: addTabPhotoMode }
          : {}),
        ...entry.analytics,
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
      return saved ?? null;
    },
    [saveEntry, promptType, promptValue, posthog, isFirstTime, fetchEntries, userId, addTabPhotoMode]
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

  const handlePhotoReplaceFromLibrary = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const picked = await pickPhotoFromLibrary();
    if (!picked) return;
    setPhotoUri(picked.uri);
    setPhotoDate(picked.creationTime);
  }, []);

  const handleRequestPhotoAccess = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await ensureFullPhotoAccess();
    if (ok) {
      const photo = await getRandomAsset();
      if (photo) {
        setPhotoUri(photo.uri);
        setPhotoDate(photo.creationTime);
      }
    }
    await checkPermission();
  }, [ensureFullPhotoAccess, getRandomAsset, checkPermission]);

  const addPhotoPermissionBlocked =
    promptType === "photo" &&
    !photoUri &&
    !hasFullPhotoLibraryAccess(permissionStatus, accessPrivileges);

  const handleReturnToStart = useCallback(() => {
    setTabBarHidden(false);
    setPhase("choose");
    setPromptType("word");
    setPromptValue("");
    setPhotoUri(undefined);
    setPhotoDate(undefined);
    setAddTabPhotoMode(null);
  }, [setTabBarHidden]);

  const handleExitFlow = useCallback(() => {
    setTabBarHidden(false);
    setPhase("choose");
    setPromptType("word");
    setPromptValue("");
    setPhotoUri(undefined);
    setPhotoDate(undefined);
    setAddTabPhotoMode(null);
  }, [setTabBarHidden]);

  const afterSaveNode = useCallback(
    (stats: AfterSaveStats, ctx: AfterSaveContext) => {
      const goCapsule = () => {
        setTabBarHidden(false);
        router.replace("/(tabs)/memories");
      };
      const goThreads = () => {
        setTabBarHidden(false);
        router.push("/threads");
      };
      const goDone = () => {
        setTabBarHidden(false);
        router.replace("/(tabs)/today");
      };

      const totalDisplayed = stats.totalMoments;
      const isFreeMilestone10 =
        subscriptionStatus === "free" &&
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
            streakCount={stats.streakCount}
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
                analyticsSource="add_chat_milestone"
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
              <EllieMessage content="Great job logging more moments. Your Capsule is growing and we're connecting more dots for you. Where to next?" />
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
    [colors, firstName, subscriptionStatus, setTabBarHidden, totalConnections]
  );

  if (phase === "choose") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {fullPhotoAccessModal}
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
      {fullPhotoAccessModal}
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
        onComplete={handleComplete}
        onPhotoShuffle={
          promptType === "photo" && !addPhotoPermissionBlocked
            ? addTabPhotoMode === "library"
              ? handlePhotoReplaceFromLibrary
              : handlePhotoShuffle
            : undefined
        }
        photoControlVariant={addTabPhotoMode === "library" ? "change" : "shuffle"}
        isShufflingPhoto={addTabPhotoMode === "library" ? false : isShuffling}
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
          permissionStatus === "denied" || accessPrivileges === "limited"
            ? "Open Settings"
            : "Grant photo access"
        }
        ensureFullPhotoLibraryAccess={ensureFullPhotoAccess}
        analyticsSource="add_tab"
      />

      <ShareMomentModal
        visible={shareModalVisible}
        entry={savedEntry}
        onDismiss={() => setShareModalVisible(false)}
      />
    </SafeAreaView>
  );
}
