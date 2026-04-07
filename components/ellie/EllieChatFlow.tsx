import { MicRecorder } from "@/components/composer/MicRecorder";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { useTheme } from "@/hooks/useTheme";
import {
    callMomentAssemble,
    callMomentFollowUp,
    type PromptType,
} from "@/lib/momentAssist";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getStreakDisplayFromStores, type AfterSaveStats } from "@/hooks/useStreak";
import { EllieMessage } from "./EllieMessage";
import { MomentPreview } from "./MomentPreview";
import { PromptCard } from "./PromptCard";
import { UserMessage } from "./UserMessage";

export type { AfterSaveStats };

type FlowPhase =
  | "prompt"
  | "recording"
  | "thinking1"
  | "follow_up"
  | "thinking2"
  | "preview"
  | "deeper_thinking"
  | "deeper_followup"
  | "deeper_thinking2"
  | "saved"
  | "mic";

export type InputMethod = "speaking" | "typing";

interface EllieChatFlowProps {
  promptType: PromptType;
  promptValue: string;
  photoUri?: string;
  photoDate?: number;
  isShufflingPhoto?: boolean;
  onComplete: (
    entry: { title: string; body: string; rawText: string; attachedPhotoUri?: string }
  ) => void | Promise<void>;
  onPhotoShuffle?: () => void;
  welcomeMessages?: string[];
  promptInstruction?: string;
  extraGuidance?: string;
  firstReplyOverride?: string;
  /** Called after save completes and entries are updated — use for stats that must match the header. */
  afterSaveNode?: (stats: AfterSaveStats) => React.ReactNode;
  onFlowStarted?: (inputMethod: InputMethod) => void;
  headerNode?: React.ReactNode;
  onSkip?: () => void;
  hideTimerHint?: boolean;
  timerHintOverride?: string;
  /** Replaces the default preview-phase instruction above the moment card. */
  previewInstructionOverride?: string;
  hideHelperText?: boolean;
  /** When set, shows a close control during timed capture (recording / mic) to reset the flow and invoke this callback (e.g. restore tab bar on Today). */
  onAbortFlow?: () => void;
  /** Italic line below the photo prompt question (e.g. activation shuffle hint). */
  photoFooterNote?: string;
  photoPermissionBlocked?: boolean;
  onRequestPhotoAccess?: () => void;
  photoAccessButtonLabel?: string;
  /** Activation: fixed delay before Ellie photo footer + CTAs (matches word_saved typing beat). */
  photoEllieTypingDelayMs?: number;
  /**
   * First message + typing indicator on mount; after `typingDurationMs`, remaining messages and the prompt card appear.
   * Do not pass `welcomeMessages` when using this (first message is only in `firstMessage`).
   */
  stagedWelcomeReveal?: {
    firstMessage: string;
    followingMessages: string[];
    typingDurationMs?: number;
  };
}

interface ChatItem {
  id: string;
  type: "ellie" | "user" | "prompt" | "preview" | "thinking" | "custom";
  content?: string;
  customNode?: React.ReactNode;
  showAvatar?: boolean;
}

const DURATION_SECONDS = 120;

function formatTimer(remaining: number): string {
  const abs = Math.abs(remaining);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const sign = remaining < 0 ? "-" : "";
  return `${sign}${m}:${s.toString().padStart(2, "0")}`;
}

const PREVIEW_INSTRUCTION =
  "Here's your moment. Tap anywhere in the card to make your own edits.";

export function EllieChatFlow({
  promptType,
  promptValue,
  photoUri,
  photoDate,
  isShufflingPhoto,
  onComplete,
  onPhotoShuffle,
  welcomeMessages,
  promptInstruction,
  extraGuidance,
  firstReplyOverride,
  afterSaveNode,
  onFlowStarted,
  headerNode,
  onSkip,
  hideTimerHint,
  timerHintOverride,
  previewInstructionOverride,
  hideHelperText,
  onAbortFlow,
  stagedWelcomeReveal,
  photoFooterNote,
  photoPermissionBlocked,
  onRequestPhotoAccess,
  photoAccessButtonLabel,
  photoEllieTypingDelayMs,
}: EllieChatFlowProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const initialMessagesRef = useRef<ChatItem[]>([]);

  const [phase, setPhase] = useState<FlowPhase>("prompt");
  /** Photo prompts: hide timer + CTAs until photo URI is ready, or after `photoEllieTypingDelayMs` (activation). */
  const [photoFirstViewportReady, setPhotoFirstViewportReady] = useState(
    () => promptType !== "photo"
  );
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [welcomeStageReady, setWelcomeStageReady] = useState(() => stagedWelcomeReveal == null);
  const [userInput, setUserInput] = useState("");
  const [rawText, setRawText] = useState("");
  const [allRawText, setAllRawText] = useState("");
  const [assembledTitle, setAssembledTitle] = useState("");
  const [assembledBody, setAssembledBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [goingDeeper, setGoingDeeper] = useState(false);
  const [deeperCount, setDeeperCount] = useState(0);
  const followUpAskedRef = useRef(false);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const idCounter = useRef(0);
  const nextId = () => String(++idCounter.current);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  useEffect(() => {
    if (promptType !== "photo") {
      setPhotoFirstViewportReady(true);
      return;
    }
    if (photoPermissionBlocked) {
      setPhotoFirstViewportReady(false);
      return;
    }
    /** Activation (`photoEllieTypingDelayMs`): CTAs unlock on a fixed timer from PromptCard / backup below — never force false just because the photo URI is still loading. */
    if (photoEllieTypingDelayMs) {
      return;
    }
    if (!photoUri) {
      setPhotoFirstViewportReady(false);
    }
  }, [promptType, photoPermissionBlocked, photoUri, photoEllieTypingDelayMs]);

  /** Activation: unlock Start speaking/typing after fixed ms from entering photo step (independent of photo fetch). */
  useEffect(() => {
    if (
      promptType !== "photo" ||
      !photoEllieTypingDelayMs ||
      photoPermissionBlocked
    ) {
      return;
    }
    const t = setTimeout(() => {
      setPhotoFirstViewportReady(true);
    }, photoEllieTypingDelayMs);
    return () => clearTimeout(t);
  }, [promptType, photoEllieTypingDelayMs, photoPermissionBlocked]);

  const handlePhotoViewportReady = useCallback(() => {
    setPhotoFirstViewportReady(true);
  }, []);

  useEffect(() => {
    if (stagedWelcomeReveal) {
      const { firstMessage, followingMessages, typingDurationMs = 5000 } = stagedWelcomeReveal;

      const fullInitial: ChatItem[] = [];
      const firstId = nextId();
      fullInitial.push({ id: firstId, type: "ellie", content: firstMessage });
      for (const text of followingMessages) {
        fullInitial.push({ id: nextId(), type: "ellie", content: text });
      }
      fullInitial.push({ id: nextId(), type: "prompt" });
      if (extraGuidance) {
        fullInitial.push({ id: nextId(), type: "ellie", content: extraGuidance, showAvatar: true });
      }
      const snapshot = fullInitial.map((m) => ({ ...m }));
      initialMessagesRef.current = snapshot;

      const thinkingId = nextId();
      setMessages([
        { id: firstId, type: "ellie", content: firstMessage },
        { id: thinkingId, type: "thinking" },
      ]);
      scrollToEnd();

      const t = setTimeout(() => {
        setMessages(snapshot.map((m) => ({ ...m })));
        setWelcomeStageReady(true);
        scrollToEnd();
      }, typingDurationMs);

      return () => clearTimeout(t);
    }

    const initial: ChatItem[] = [];
    if (welcomeMessages) {
      for (const msg of welcomeMessages) {
        initial.push({ id: nextId(), type: "ellie", content: msg });
      }
    }
    initial.push({ id: nextId(), type: "prompt" });
    if (extraGuidance) {
      initial.push({ id: nextId(), type: "ellie", content: extraGuidance, showAvatar: true });
    }
    initialMessagesRef.current = initial.map((m) => ({ ...m }));
    setMessages(initial);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleAbortFlow = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    stopTimer();
    setElapsed(0);
    setPhase("prompt");
    setUserInput("");
    setRawText("");
    setAllRawText("");
    setAssembledTitle("");
    setAssembledBody("");
    setSaving(false);
    setGoingDeeper(false);
    setDeeperCount(0);
    followUpAskedRef.current = false;
    setWelcomeStageReady(true);
    setMessages(initialMessagesRef.current.map((m) => ({ ...m })));
    onAbortFlow?.();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [stopTimer, onAbortFlow]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  useEffect(() => {
    const event = Platform.OS === "ios" ? "keyboardDidShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(event, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return () => sub.remove();
  }, []);

  const handleStartTyping = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFlowStarted?.("typing");
    setPhase("recording");
    startTimer();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
  }, [startTimer, onFlowStarted]);

  const handleStartSpeaking = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onFlowStarted?.("speaking");
    startTimer();
    setPhase("mic");
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 400);
  }, [startTimer, onFlowStarted]);

  const showPreview = useCallback(
    (title: string, body: string) => {
      setAssembledTitle(title);
      setAssembledBody(body);
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "thinking"),
        { id: nextId(), type: "ellie", content: previewInstructionOverride ?? PREVIEW_INSTRUCTION },
        { id: nextId(), type: "preview" },
      ]);
      setPhase("preview");
      scrollToEnd();
    },
    [scrollToEnd, previewInstructionOverride]
  );

  const handleDone = useCallback(async () => {
    stopTimer();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const text = userInput.trim();
    if (!text) {
      setPhase("prompt");
      setElapsed(0);
      return;
    }

    // If a follow-up was already asked, go straight to assembly
    if (followUpAskedRef.current) {
      setAllRawText((prev) => `${prev}\n\n${text}`);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: text },
        { id: nextId(), type: "thinking" },
      ]);
      setPhase("thinking2");
      setUserInput("");
      scrollToEnd();

      try {
        const { title, body } = await callMomentAssemble({
          raw_text: rawText,
          prompt_type: promptType,
          prompt_value: promptValue,
          follow_up_answer: text,
        });
        showPreview(title, body);
      } catch {
        Alert.alert("Connection error", "Could not assemble moment. Your text is saved as-is.");
        showPreview("", rawText);
      }
      return;
    }

    setRawText(text);
    setAllRawText(text);
    setMessages((prev) => [
      ...prev,
      { id: nextId(), type: "user", content: text },
      { id: nextId(), type: "thinking" },
    ]);
    setPhase("thinking1");
    setUserInput("");
    scrollToEnd();

    try {
      const { question } = await callMomentFollowUp({
        raw_text: text,
        prompt_type: promptType,
        prompt_value: promptValue,
      });

      const replyText = firstReplyOverride
        ? `${firstReplyOverride}\n\n${question}`
        : question;

      followUpAskedRef.current = true;
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "thinking"),
        { id: nextId(), type: "ellie", content: replyText },
      ]);
      setPhase("follow_up");
      scrollToEnd();
    } catch {
      Alert.alert("Connection error", "Could not reach Ellie. Your text is saved as-is.");
      setMessages((prev) => prev.filter((m) => m.type !== "thinking"));
      showPreview("", text);
    }
  }, [userInput, rawText, promptType, promptValue, stopTimer, scrollToEnd, firstReplyOverride, showPreview]);

  const handleFollowUpAnswer = useCallback(async () => {
    const answer = userInput.trim();
    setUserInput("");

    if (answer) {
      setAllRawText((prev) => `${prev}\n\n${answer}`);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: answer },
        { id: nextId(), type: "thinking" },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: "thinking" },
      ]);
    }
    setPhase("thinking2");
    scrollToEnd();

    try {
      const { title, body } = await callMomentAssemble({
        raw_text: rawText,
        prompt_type: promptType,
        prompt_value: promptValue,
        follow_up_answer: answer || null,
      });
      showPreview(title, body);
    } catch {
      Alert.alert("Connection error", "Could not assemble moment. Your text is saved as-is.");
      showPreview("", rawText);
    }
  }, [userInput, rawText, promptType, promptValue, scrollToEnd, showPreview]);

  const handleSkipFollowUp = useCallback(() => {
    setUserInput("");
    void handleFollowUpAnswer();
  }, [handleFollowUpAnswer]);

  const handleGoDeeper = useCallback(async () => {
    posthog.capture("started_dig_deeper", { prompt_type: promptType });
    setGoingDeeper(true);
    setDeeperCount((c) => c + 1);

    // Convert the current preview to a static read-only card
    setMessages((prev) =>
      prev.map((m) =>
        m.type === "preview"
          ? {
              ...m,
              type: "custom" as const,
              customNode: (
                <View
                  style={{
                    marginBottom: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceSecondary,
                    padding: 16,
                    opacity: 0.6,
                  }}
                >
                  {assembledTitle ? (
                    <Text
                      style={{
                        fontFamily: "LibreBaskerville-Bold",
                        fontSize: 16,
                        color: colors.text,
                        marginBottom: 8,
                      }}
                    >
                      {assembledTitle}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      fontFamily: "Roboto-Regular",
                      fontSize: 14,
                      lineHeight: 22,
                      color: colors.textSecondary,
                    }}
                    numberOfLines={4}
                  >
                    {assembledBody}
                  </Text>
                </View>
              ),
            }
          : m
      )
    );

    setMessages((prev) => [...prev, { id: nextId(), type: "thinking" }]);
    setPhase("deeper_thinking");
    scrollToEnd();

    try {
      const { question } = await callMomentFollowUp({
        raw_text: allRawText,
        prompt_type: promptType,
        prompt_value: promptValue,
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "thinking"),
        { id: nextId(), type: "ellie", content: question },
      ]);
      setPhase("deeper_followup");
      setGoingDeeper(false);
      scrollToEnd();
    } catch {
      setGoingDeeper(false);
      setPhase("preview");
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "thinking"),
        { id: nextId(), type: "preview" },
      ]);
      scrollToEnd();
    }
  }, [allRawText, promptType, promptValue, scrollToEnd, colors, assembledTitle, assembledBody]);

  const handleDeeperAnswer = useCallback(async () => {
    const answer = userInput.trim();
    setUserInput("");

    if (answer) {
      setAllRawText((prev) => `${prev}\n\n${answer}`);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: answer },
        { id: nextId(), type: "thinking" },
      ]);
    } else {
      setMessages((prev) => [...prev, { id: nextId(), type: "thinking" }]);
    }
    setPhase("deeper_thinking2");
    scrollToEnd();

    try {
      const combinedRaw = answer ? `${allRawText}\n\n${answer}` : allRawText;
      const { title, body } = await callMomentAssemble({
        raw_text: combinedRaw,
        prompt_type: promptType,
        prompt_value: promptValue,
        follow_up_answer: answer || null,
      });
      showPreview(title, body);
    } catch {
      showPreview(assembledTitle, assembledBody);
    }
  }, [userInput, allRawText, promptType, promptValue, scrollToEnd, showPreview, assembledTitle, assembledBody]);

  const handleSave = useCallback(
    async (title: string, body: string, attachedPhotoUri?: string) => {
      setSaving(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await Promise.resolve(
          onComplete({ title, body, rawText: allRawText, attachedPhotoUri })
        );
      } catch {
        setSaving(false);
        return;
      }

      const stats = getStreakDisplayFromStores();
      const saveFooter = afterSaveNode?.(stats);

      // Convert the preview to a static read-only card (same pattern as Go Deeper)
      setMessages((prev) => {
        const converted = prev.map((m) =>
          m.type === "preview"
            ? {
                ...m,
                type: "custom" as const,
                customNode: (
                  <View
                    style={{
                      marginBottom: 16,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceSecondary,
                      overflow: "hidden",
                      opacity: 0.6,
                    }}
                  >
                    {attachedPhotoUri ? (
                      <Image
                        source={{ uri: attachedPhotoUri }}
                        style={{ width: "100%", height: 200 }}
                        contentFit="cover"
                      />
                    ) : null}
                    <View style={{ padding: 16 }}>
                      {assembledTitle ? (
                        <Text
                          style={{
                            fontFamily: "LibreBaskerville-Bold",
                            fontSize: 16,
                            color: colors.text,
                            marginBottom: 8,
                          }}
                        >
                          {assembledTitle}
                        </Text>
                      ) : null}
                      <Text
                        style={{
                          fontFamily: "Roboto-Regular",
                          fontSize: 14,
                          lineHeight: 22,
                          color: colors.textSecondary,
                        }}
                        numberOfLines={4}
                      >
                        {assembledBody}
                      </Text>
                    </View>
                  </View>
                ),
              }
            : m
        );

        if (saveFooter) {
          converted.push({ id: nextId(), type: "custom", customNode: saveFooter });
        }
        return converted;
      });

      setPhase("saved");
      setSaving(false);
      scrollToEnd();
    },
    [onComplete, allRawText, scrollToEnd, afterSaveNode, colors, assembledTitle, assembledBody]
  );

  const handleMicTranscription = useCallback(
    (text: string) => {
      setUserInput((prev) => (prev ? `${prev} ${text}` : text));
      if (phase === "mic") {
        setPhase("recording");
      }
    },
    [phase]
  );

  const remaining = DURATION_SECONDS - elapsed;
  const isOvertime = remaining < 0;

  // Half-sheet mic overlay
  if (phase === "mic") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
        >
          {messages.map((msg) => {
            if (msg.type === "ellie") return <EllieMessage key={msg.id} content={msg.content!} showAvatar={msg.showAvatar} />;
            if (msg.type === "prompt") return (
              <PromptCard
                key={msg.id}
                promptType={promptType}
                promptValue={promptValue}
                photoUri={photoUri}
                photoDate={photoDate}
                isShuffling={isShufflingPhoto}
                onShuffle={onPhotoShuffle}
                instruction={promptInstruction}
                hideHelperText={hideHelperText}
              />
            );
            return null;
          })}

          {/* Timer visible above the mic sheet */}
          {onAbortFlow ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 8,
                marginBottom: 16,
                paddingHorizontal: 4,
              }}
            >
              <View style={{ width: 40 }} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 36,
                  color: isOvertime ? "#EF4444" : colors.text,
                  textAlign: "center",
                }}
              >
                {formatTimer(remaining)}
              </Text>
              <View style={{ width: 40, alignItems: "center", justifyContent: "center" }}>
                <Pressable
                  onPress={handleAbortFlow}
                  hitSlop={12}
                  accessibilityLabel="Exit moment capture"
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
            </View>
          ) : (
            <View style={{ alignItems: "center", marginTop: 8, marginBottom: 16 }}>
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 36,
                  color: isOvertime ? "#EF4444" : colors.text,
                  textAlign: "center",
                }}
              >
                {formatTimer(remaining)}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Half-sheet mic recorder */}
        <View
          style={{
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 16),
            maxHeight: "45%",
          }}
        >
          <MicRecorder
            onTranscription={(text) => {
              handleMicTranscription(text);
            }}
            onCancel={() => setPhase("recording")}
          />
        </View>
      </View>
    );
  }

  const showInputBar =
    phase === "recording" ||
    phase === "follow_up" ||
    phase === "deeper_followup";
  const isFollowUp = phase === "follow_up" || phase === "deeper_followup";

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {headerNode}
        {messages.map((msg) => {
          switch (msg.type) {
            case "ellie":
              return <EllieMessage key={msg.id} content={msg.content!} showAvatar={msg.showAvatar} />;
            case "user":
              return <UserMessage key={msg.id} content={msg.content!} />;
            case "prompt":
              return (
                <PromptCard
                  key={msg.id}
                  promptType={promptType}
                  promptValue={promptValue}
                  photoUri={photoUri}
                  photoDate={photoDate}
                  isShuffling={isShufflingPhoto}
                  onShuffle={onPhotoShuffle}
                  instruction={promptInstruction}
                  hideHelperText={hideHelperText}
                  photoFooterNote={photoFooterNote}
                  photoPermissionBlocked={photoPermissionBlocked}
                  onRequestPhotoAccess={onRequestPhotoAccess}
                  photoAccessButtonLabel={photoAccessButtonLabel}
                  onPhotoViewportReady={handlePhotoViewportReady}
                  photoEllieTypingDelayMs={photoEllieTypingDelayMs}
                />
              );
            case "thinking":
              return <ThinkingDots key={msg.id} />;
            case "preview":
              return (
                <MomentPreview
                  key={msg.id}
                  title={assembledTitle}
                  body={assembledBody}
                  photoUri={promptType === "photo" ? photoUri : undefined}
                  onSave={handleSave}
                  onGoDeeper={deeperCount < 3 ? handleGoDeeper : undefined}
                  saving={saving}
                  goingDeeper={goingDeeper}
                />
              );
            case "custom":
              return <View key={msg.id}>{msg.customNode}</View>;
            default:
              return null;
          }
        })}

        {/* Start options when in prompt phase */}
        {phase === "prompt" &&
          welcomeStageReady &&
          (promptType !== "photo" || photoFirstViewportReady) && (
          <View style={{ gap: 10, marginTop: 8 }}>
            {!hideTimerHint && (
              <View style={{ alignItems: "center", marginBottom: 4 }}>
                <Text
                  style={{
                    fontFamily: "Roboto-Light",
                    fontSize: 13,
                    color: colors.textMuted,
                  }}
                >
                  {timerHintOverride ?? "You'll have 2 minutes to share"}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleStartSpeaking}
              style={{
                height: 52,
                borderRadius: 9999,
                backgroundColor: colors.primary,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Ionicons name="mic" size={20} color="#1A1A1A" />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: "#1A1A1A",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Start speaking
              </Text>
            </Pressable>
            <Pressable
              onPress={handleStartTyping}
              style={{
                height: 48,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.text,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Start typing
              </Text>
            </Pressable>
            {onSkip && (
              <Pressable
                onPress={onSkip}
                style={{ height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 }}
              >
                <Text style={{ fontFamily: "Roboto-Light", fontSize: 14, color: colors.textMuted }}>
                  Skip for now
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {showInputBar && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.background,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          {phase === "recording" && (
            onAbortFlow ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 8,
                  paddingHorizontal: 4,
                }}
              >
                <View style={{ width: 40 }} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: isOvertime ? "#EF4444" : colors.text,
                    textAlign: "center",
                  }}
                >
                  {formatTimer(remaining)}
                </Text>
                <View style={{ width: 40, alignItems: "center", justifyContent: "center" }}>
                  <Pressable
                    onPress={handleAbortFlow}
                    hitSlop={12}
                    accessibilityLabel="Exit moment capture"
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
              </View>
            ) : (
              <View style={{ alignItems: "center", marginBottom: 8 }}>
                <Text
                  style={{
                    fontFamily: "LibreBaskerville-Bold",
                    fontSize: 28,
                    color: isOvertime ? "#EF4444" : colors.text,
                    textAlign: "center",
                  }}
                >
                  {formatTimer(remaining)}
                </Text>
              </View>
            )
          )}

          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 8,
            }}
          >
            <TextInput
              value={userInput}
              onChangeText={setUserInput}
              placeholder={
                isFollowUp
                  ? "Answer Ellie..."
                  : "Speak your mind or type here..."
              }
              placeholderTextColor={colors.textMuted}
              multiline
              scrollEnabled
              textAlignVertical="top"
              autoFocus={phase === "recording"}
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.text,
                minHeight: 44,
                maxHeight: 160,
                paddingVertical: 6,
                paddingHorizontal: 4,
              }}
            />

            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 10,
                marginTop: 8,
              }}
            >
              <Pressable
                onPress={() => setPhase("mic")}
                hitSlop={6}
                style={{
                  borderRadius: 10,
                  backgroundColor: colors.surfaceSecondary,
                  padding: 10,
                }}
              >
                <Ionicons name="mic-outline" size={22} color={colors.icon} />
              </Pressable>

              {isFollowUp && (
                <Pressable
                  onPress={
                    phase === "deeper_followup"
                      ? handleDeeperAnswer
                      : handleSkipFollowUp
                  }
                  hitSlop={6}
                  style={{
                    borderRadius: 10,
                    backgroundColor: colors.surfaceSecondary,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ fontFamily: "Roboto-Regular", fontSize: 13, color: colors.textMuted }}>
                    Skip
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={
                  phase === "deeper_followup"
                    ? handleDeeperAnswer
                    : isFollowUp
                      ? handleFollowUpAnswer
                      : handleDone
                }
                disabled={!userInput.trim() && !isFollowUp}
                hitSlop={6}
                style={{
                  borderRadius: 9999,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: "#000000",
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  opacity: !userInput.trim() && !isFollowUp ? 0.45 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: "#000000",
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  {isFollowUp ? "Send" : "Done"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
