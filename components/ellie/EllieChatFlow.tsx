import { MicRecorder } from "@/components/composer/MicRecorder";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { CountdownProgressBar } from "@/components/ellie/CountdownProgressBar";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import {
    callMomentAssemble,
    callMomentFollowUp,
    type PromptType,
} from "@/lib/momentAssist";
import {
  categorizePhotoBucket,
  photoAgeDays,
  photoYear,
  type PhotoBucket,
} from "@/lib/photoBucket";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { usePostHog } from "posthog-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
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
import {
  getStreakDisplayFromStores,
  type AfterSaveStats,
  type AfterSaveContext,
} from "@/hooks/useStreak";
import type { Entry } from "@/store/entryStore";
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

export interface MomentCaptureAnalytics {
  source?: "activation" | "today" | "add_tab";
  prompt_type: PromptType;
  input_method: InputMethod | null;
  first_share_elapsed_seconds: number | null;
  final_save_elapsed_seconds: number | null;
  first_share_chars: number;
  first_share_words: number;
  final_raw_chars: number;
  final_raw_words: number;
  final_body_chars: number;
  final_body_words: number;
  is_overtime_first_share: boolean;
  /** Recency bucket of the photo behind the moment (null for word/freetext). */
  photo_bucket: PhotoBucket | null;
  /** Days between photo capture and save time (null for word/freetext). */
  photo_age_days: number | null;
  /** Year the photo was originally taken (null for word/freetext). */
  photo_year: number | null;
  /** Number of times the user shuffled before committing this moment. */
  shuffles_before_save: number;
}

interface EllieChatFlowProps {
  promptType: PromptType;
  promptValue: string;
  photoUri?: string;
  photoDate?: number;
  /**
   * Recency bucket of the currently displayed photo. If omitted but
   * `photoDate` is present, the bucket is computed from `photoDate` at save
   * time. Pass it explicitly when the parent already has the bucket from the
   * picker so analytics stays consistent.
   */
  photoBucket?: PhotoBucket;
  /** Number of times the user has shuffled photos before the current one. */
  shufflesBeforeSave?: number;
  isShufflingPhoto?: boolean;
  onComplete: (
    entry: {
      title: string;
      body: string;
      rawText: string;
      attachedPhotoUri?: string;
      attachedPhotoTakenAtMs?: number;
      analytics?: MomentCaptureAnalytics;
    }
  ) => void | Promise<void | Entry | null>;
  onPhotoShuffle?: () => void;
  /** Photo prompt control: random shuffle vs re-open gallery (Add tab — choose photo). */
  photoControlVariant?: "shuffle" | "change";
  welcomeMessages?: string[];
  promptInstruction?: string;
  extraGuidance?: string;
  firstReplyOverride?: string;
  /** Called after save completes and entries are updated — use for stats that must match the header. */
  afterSaveNode?: (
    stats: AfterSaveStats,
    ctx: AfterSaveContext
  ) => React.ReactNode;
  onFlowStarted?: (inputMethod: InputMethod) => void;
  /** If set, automatically starts speaking or typing once the prompt step is ready (Curator handoff). */
  autoStartInputMethod?: InputMethod;
  headerNode?: React.ReactNode;
  /** Question flow: substring of `promptValue` for italic + highlight (matches Curator). */
  promptAccent?: string;
  /** Question flow: 1-based index for "QUESTION N OF M" when chrome is rich. */
  questionOrdinal?: { current: number; total: number };
  onSkip?: () => void;
  /** Label for the bottom-of-flow skip link. Default: "Skip for now". */
  skipLabel?: string;
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
  /** Forwarded to PromptCard's photo nudge: tap-link "start with a word instead". */
  onPhotoAccessWordFallback?: () => void;
  /** Gate gallery / system picker behind full-library explainer + permission (Add / Today / activation). */
  ensureFullPhotoLibraryAccess?: () => Promise<boolean>;
  /** Activation: fixed delay before Ellie photo footer + CTAs (matches word_saved typing beat). */
  photoEllieTypingDelayMs?: number;
  /** Ellie follow-up sentence under the photo in the photo prompt flow. */
  photoEllieFollowUp?: string;
  analyticsSource?: "activation" | "today" | "add_tab";
  /**
   * First message + typing indicator on mount; after `typingDurationMs`, remaining messages and the prompt card appear.
   * Do not pass `welcomeMessages` when using this (first message is only in `firstMessage`).
   */
  stagedWelcomeReveal?: {
    firstMessage: string;
    followingMessages: string[];
    typingDurationMs?: number;
  };
  /** When set, shows a "More ways" pill below the CTAs that invokes this handler. */
  onMoreWaysPress?: () => void;
  /**
   * Pixels **below** the top safe-area inset to add to iOS `KeyboardAvoidingView`
   * (e.g. Capture tab wordmark row ~48pt). Safe-area top is always included.
   */
  keyboardAvoidingExtraOffset?: number;
  /** When true, "Send" assembles the moment and saves immediately — no follow-up question, no preview. */
  skipPreview?: boolean;
}

interface ChatItem {
  id: string;
  type: "ellie" | "user" | "prompt" | "preview" | "thinking" | "custom";
  content?: string;
  customNode?: React.ReactNode;
  showAvatar?: boolean;
}

const DURATION_SECONDS = 60;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

const PREVIEW_INSTRUCTION =
  "Here's your moment. Tap anywhere in the card to make your own edits.";

export function EllieChatFlow({
  promptType,
  promptValue,
  photoUri,
  photoDate,
  photoBucket,
  shufflesBeforeSave = 0,
  isShufflingPhoto,
  onComplete,
  onPhotoShuffle,
  photoControlVariant = "shuffle",
  welcomeMessages,
  promptInstruction,
  extraGuidance,
  firstReplyOverride,
  afterSaveNode,
  onFlowStarted,
  autoStartInputMethod,
  headerNode,
  promptAccent,
  questionOrdinal,
  onSkip,
  skipLabel = "Skip for now",
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
  onPhotoAccessWordFallback,
  photoEllieTypingDelayMs,
  photoEllieFollowUp,
  analyticsSource,
  ensureFullPhotoLibraryAccess,
  onMoreWaysPress,
  skipPreview,
  keyboardAvoidingExtraOffset = 0,
}: EllieChatFlowProps) {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const iosKeyboardVerticalOffset = insets.top + keyboardAvoidingExtraOffset;
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
  /** Message id of the live preview frozen while "Go Deeper" runs (revert on failure). */
  const frozenPreviewForDeeperIdRef = useRef<string | null>(null);

  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtMsRef = useRef<number | null>(null);
  const inputMethodRef = useRef<InputMethod | null>(null);
  const firstShareMetricsRef = useRef<{
    elapsedSeconds: number;
    chars: number;
    words: number;
    isOvertime: boolean;
  } | null>(null);

  const idCounter = useRef(0);
  const nextId = () => String(++idCounter.current);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  /**
   * Tracks whether any content has been added past the initial prompt card
   * (user reply, Ellie follow-up, preview, etc.). Until that's true, we skip
   * the auto-scroll-to-end on phase changes, keyboard show events, and
   * `onContentSizeChange` so the question / photo prompt stays visible at the
   * top of the chat instead of getting pushed off-screen.
   */
  const hasContentBeyondPromptRef = useRef(false);

  const questionChrome: "rich" | "minimal" | undefined =
    promptType === "question"
      ? phase === "prompt"
        ? "rich"
        : "minimal"
      : undefined;

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
    startedAtMsRef.current = null;
    inputMethodRef.current = null;
    firstShareMetricsRef.current = null;
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
    hasContentBeyondPromptRef.current = false;
    setWelcomeStageReady(true);
    setMessages(initialMessagesRef.current.map((m) => ({ ...m })));
    onAbortFlow?.();
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
  }, [stopTimer, onAbortFlow]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  /**
   * Once the chat has more than the initial seed messages (welcome + prompt
   * + extraGuidance), let scroll-to-end fire normally so follow-up replies
   * stay in view. We compare against the seeded length captured by
   * `initialMessagesRef`.
   */
  useEffect(() => {
    const baseline = initialMessagesRef.current.length;
    if (baseline === 0) return;
    if (messages.length > baseline) {
      hasContentBeyondPromptRef.current = true;
    }
  }, [messages.length]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvent, () => {
      if (!hasContentBeyondPromptRef.current) return;
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 280);
    });
    return () => sub.remove();
  }, []);

  const handleStartTyping = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    inputMethodRef.current = "typing";
    if (!startedAtMsRef.current) startedAtMsRef.current = Date.now();
    firstShareMetricsRef.current = null;
    onFlowStarted?.("typing");
    setPhase("recording");
    startTimer();
  }, [startTimer, onFlowStarted]);

  const handleStartSpeaking = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    inputMethodRef.current = "speaking";
    if (!startedAtMsRef.current) startedAtMsRef.current = Date.now();
    firstShareMetricsRef.current = null;
    onFlowStarted?.("speaking");
    startTimer();
    setPhase("mic");
  }, [startTimer, onFlowStarted]);

  const autoStartConsumedRef = useRef(false);
  useEffect(() => {
    if (!autoStartInputMethod) {
      autoStartConsumedRef.current = false;
      return;
    }
    if (autoStartConsumedRef.current) return;
    if (phase !== "prompt") return;
    if (!welcomeStageReady) return;
    if (promptType === "photo" && !photoFirstViewportReady) return;
    autoStartConsumedRef.current = true;
    if (autoStartInputMethod === "speaking") handleStartSpeaking();
    else handleStartTyping();
  }, [
    autoStartInputMethod,
    phase,
    welcomeStageReady,
    photoFirstViewportReady,
    promptType,
    handleStartTyping,
    handleStartSpeaking,
  ]);

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
      startedAtMsRef.current = null;
      inputMethodRef.current = null;
      firstShareMetricsRef.current = null;
      return;
    }

    const elapsedSeconds = startedAtMsRef.current
      ? Math.max(0, Math.round((Date.now() - startedAtMsRef.current) / 1000))
      : elapsed;
    const firstShareChars = text.length;
    const firstShareWords = countWords(text);
    const isOvertimeFirstShare = elapsedSeconds > DURATION_SECONDS;
    firstShareMetricsRef.current = {
      elapsedSeconds,
      chars: firstShareChars,
      words: firstShareWords,
      isOvertime: isOvertimeFirstShare,
    };
    posthog.capture("moment_first_share_done", {
      source: analyticsSource,
      prompt_type: promptType,
      input_method: inputMethodRef.current,
      first_share_elapsed_seconds: elapsedSeconds,
      first_share_chars: firstShareChars,
      first_share_words: firstShareWords,
      is_overtime_first_share: isOvertimeFirstShare,
      deeper_count_at_first_share: deeperCount,
    });

    // Skip-preview flow: assemble immediately and save, no follow-up, no preview.
    if (skipPreview) {
      setRawText(text);
      setAllRawText(text);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), type: "user", content: text },
        { id: nextId(), type: "thinking" },
      ]);
      setPhase("thinking2");
      setUserInput("");
      scrollToEnd();
      setSaving(true);

      let title = "";
      let body = text;
      try {
        const assembled = await callMomentAssemble({
          raw_text: text,
          prompt_type: promptType,
          prompt_value: promptValue,
          follow_up_answer: null,
        });
        title = assembled.title;
        body = assembled.body;
      } catch {
        // Network/AI failure: save raw text as-is.
        title = "";
        body = text;
      }

      const finalSaveElapsedSeconds = startedAtMsRef.current
        ? Math.max(0, Math.round((Date.now() - startedAtMsRef.current) / 1000))
        : null;
      const photoBucketResolved =
        photoDate != null
          ? photoBucket ?? categorizePhotoBucket(photoDate)
          : null;
      const analytics: MomentCaptureAnalytics = {
        source: analyticsSource,
        prompt_type: promptType,
        input_method: inputMethodRef.current,
        first_share_elapsed_seconds: elapsedSeconds,
        final_save_elapsed_seconds: finalSaveElapsedSeconds,
        first_share_chars: firstShareChars,
        first_share_words: firstShareWords,
        final_raw_chars: text.length,
        final_raw_words: countWords(text),
        final_body_chars: body.length,
        final_body_words: countWords(body),
        is_overtime_first_share: isOvertimeFirstShare,
        photo_bucket: photoBucketResolved,
        photo_age_days: photoDate != null ? photoAgeDays(photoDate) : null,
        photo_year: photoDate != null ? photoYear(photoDate) : null,
        shuffles_before_save: shufflesBeforeSave,
      };

      try {
        await Promise.resolve(
          onComplete({
            title,
            body,
            rawText: text,
            attachedPhotoUri: photoUri,
            attachedPhotoTakenAtMs: photoDate,
            analytics,
          })
        );
      } catch {
        // onComplete failed — leave the user on the recording phase to retry.
        setSaving(false);
        setPhase("recording");
        return;
      }
      // Parent (e.g. Today) will re-render on the new entry; this component will unmount.
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
  }, [
    userInput,
    rawText,
    promptType,
    promptValue,
    stopTimer,
    scrollToEnd,
    firstReplyOverride,
    showPreview,
    elapsed,
    posthog,
    analyticsSource,
    deeperCount,
    skipPreview,
    onComplete,
    photoUri,
    photoDate,
    photoBucket,
    shufflesBeforeSave,
  ]);

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
    setMessages((prev) => {
      const previewEntry = prev.find((x) => x.type === "preview");
      frozenPreviewForDeeperIdRef.current = previewEntry?.id ?? null;
      return prev.map((m) =>
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
      );
    });

    setMessages((prev) => [...prev, { id: nextId(), type: "thinking" }]);
    setPhase("deeper_thinking");
    scrollToEnd();

    try {
      const { question } = await callMomentFollowUp({
        raw_text: allRawText,
        prompt_type: promptType,
        prompt_value: promptValue,
      });

      frozenPreviewForDeeperIdRef.current = null;
      setMessages((prev) => [
        ...prev.filter((m) => m.type !== "thinking"),
        { id: nextId(), type: "ellie", content: question },
      ]);
      setPhase("deeper_followup");
      setGoingDeeper(false);
      scrollToEnd();
    } catch {
      const fid = frozenPreviewForDeeperIdRef.current;
      frozenPreviewForDeeperIdRef.current = null;
      setGoingDeeper(false);
      setPhase("preview");
      setMessages((prev) =>
        prev
          .filter((m) => m.type !== "thinking")
          .map((m) =>
            m.type === "custom" && m.id === fid
              ? { id: m.id, type: "preview" as const }
              : m
          )
      );
      scrollToEnd();
      Alert.alert(
        "Connection error",
        "Could not load the next question. Check your connection and try again."
      );
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
      Alert.alert(
        "Connection error",
        "Could not refresh your moment after that answer. Your last preview is unchanged."
      );
      showPreview(assembledTitle, assembledBody);
    }
  }, [userInput, allRawText, promptType, promptValue, scrollToEnd, showPreview, assembledTitle, assembledBody]);

  const handleSave = useCallback(
    async (
      title: string,
      body: string,
      attachedPhotoUri?: string,
      /** Override creation time when the user replaces the photo in MomentPreview. */
      attachedPhotoTakenAtMsOverride?: number
    ) => {
      setSaving(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      let saveCtx: AfterSaveContext = { savedEntryId: null };
      try {
        const finalSaveElapsedSeconds = startedAtMsRef.current
          ? Math.max(0, Math.round((Date.now() - startedAtMsRef.current) / 1000))
          : null;
        const firstShare = firstShareMetricsRef.current;
        // The user can swap the photo from inside MomentPreview; trust the
        // override (it carries the replacement's creationTime) over the
        // parent's photoDate prop, which still points at the prompt asset.
        const effectivePhotoDate =
          attachedPhotoTakenAtMsOverride ?? photoDate;
        const photoBucketResolved =
          effectivePhotoDate != null
            ? attachedPhotoTakenAtMsOverride != null
              ? categorizePhotoBucket(effectivePhotoDate)
              : photoBucket ?? categorizePhotoBucket(effectivePhotoDate)
            : null;
        const analytics: MomentCaptureAnalytics = {
          source: analyticsSource,
          prompt_type: promptType,
          input_method: inputMethodRef.current,
          first_share_elapsed_seconds: firstShare?.elapsedSeconds ?? null,
          final_save_elapsed_seconds: finalSaveElapsedSeconds,
          first_share_chars: firstShare?.chars ?? 0,
          first_share_words: firstShare?.words ?? 0,
          final_raw_chars: allRawText.length,
          final_raw_words: countWords(allRawText),
          final_body_chars: body.length,
          final_body_words: countWords(body),
          is_overtime_first_share: firstShare?.isOvertime ?? false,
          photo_bucket: photoBucketResolved,
          photo_age_days:
            effectivePhotoDate != null ? photoAgeDays(effectivePhotoDate) : null,
          photo_year:
            effectivePhotoDate != null ? photoYear(effectivePhotoDate) : null,
          shuffles_before_save: shufflesBeforeSave,
        };
        const completed = await Promise.resolve(
          onComplete({
            title,
            body,
            rawText: allRawText,
            attachedPhotoUri,
            attachedPhotoTakenAtMs: effectivePhotoDate,
            analytics,
          })
        );
        if (
          completed &&
          typeof completed === "object" &&
          "id" in completed &&
          typeof (completed as Entry).id === "string"
        ) {
          saveCtx = { savedEntryId: (completed as Entry).id };
        }
      } catch {
        setSaving(false);
        return;
      }

      const stats = getStreakDisplayFromStores();
      const saveFooter = afterSaveNode?.(stats, saveCtx);

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
    [
      onComplete,
      allRawText,
      scrollToEnd,
      afterSaveNode,
      colors,
      assembledTitle,
      assembledBody,
      promptType,
      analyticsSource,
      photoDate,
      photoBucket,
      shufflesBeforeSave,
    ]
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

  // Skip-preview saves run in the background. Show a centered spinner so the
  // user gets immediate "we're saving" feedback instead of a perceived black
  // flash while the entry insert + media upload finish (parent re-renders to
  // the post-save view the moment the new entry lands in the store).
  if (skipPreview && phase === "thinking2") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 14,
            color: colors.textMuted,
          }}
        >
          Saving your moment…
        </Text>
      </View>
    );
  }

  // Half-sheet mic overlay
  if (phase === "mic") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 20,
          }}
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
                photoControlVariant={photoControlVariant}
                instruction={promptInstruction}
                hideHelperText={hideHelperText}
                photoEllieFollowUp={photoEllieFollowUp}
                promptAccent={promptAccent}
                questionChrome={questionChrome}
                questionOrdinal={questionOrdinal}
              />
            );
            return null;
          })}

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
            durationSeconds={DURATION_SECONDS}
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
      keyboardVerticalOffset={
        Platform.OS === "ios" ? iosKeyboardVerticalOffset : 0
      }
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: showInputBar ? 140 : 20,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        onContentSizeChange={() => {
          if (!hasContentBeyondPromptRef.current) return;
          scrollRef.current?.scrollToEnd({ animated: true });
        }}
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
                  photoControlVariant={photoControlVariant}
                  instruction={promptInstruction}
                  hideHelperText={hideHelperText}
                  photoFooterNote={photoFooterNote}
                  photoPermissionBlocked={photoPermissionBlocked}
                  onRequestPhotoAccess={onRequestPhotoAccess}
                  photoAccessButtonLabel={photoAccessButtonLabel}
                  onPhotoAccessWordFallback={onPhotoAccessWordFallback}
                  onPhotoViewportReady={handlePhotoViewportReady}
                  photoEllieTypingDelayMs={photoEllieTypingDelayMs}
                  photoEllieFollowUp={photoEllieFollowUp}
                  promptAccent={promptAccent}
                  questionChrome={questionChrome}
                  questionOrdinal={questionOrdinal}
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
                  photoDate={promptType === "photo" ? photoDate : undefined}
                  onSave={handleSave}
                  onGoDeeper={deeperCount < 3 ? handleGoDeeper : undefined}
                  saving={saving}
                  goingDeeper={goingDeeper}
                  ensureFullPhotoLibraryAccess={ensureFullPhotoLibraryAccess}
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
                    {timerHintOverride ?? "You'll have 60 seconds to share"}
                  </Text>
                </View>
              )}
              <Pressable
                onPress={handleStartSpeaking}
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
                  ...bevelShadow(theme),
                }}
              >
                <Ionicons name="mic" size={20} color={PINK_CTA_INK} />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 15,
                    color: PINK_CTA_INK,
                    letterSpacing: 0.8,
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
              {onMoreWaysPress && (
                <View style={{ alignItems: "center", marginTop: 14 }}>
                  <Pressable
                    onPress={onMoreWaysPress}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 9999,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      borderStyle: "dashed",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Roboto-Medium",
                        fontSize: 12,
                        color: colors.text,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      More ways
                    </Text>
                    <Ionicons name="caret-up" size={11} color={colors.text} />
                  </Pressable>
                </View>
              )}
              {onSkip && (
                <Pressable
                  onPress={onSkip}
                  style={{ height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 }}
                >
                  <Text style={{ fontFamily: "Roboto-Light", fontSize: 14, color: colors.textMuted }}>
                    {skipLabel}
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
            paddingBottom: Math.max(insets.bottom, 10),
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
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <CountdownProgressBar
                    elapsed={elapsed}
                    durationSeconds={DURATION_SECONDS}
                  />
                </View>
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
              <View style={{ marginBottom: 8 }}>
                <CountdownProgressBar
                  elapsed={elapsed}
                  durationSeconds={DURATION_SECONDS}
                />
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
                  borderColor: PINK_CTA_BORDER,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                  opacity: !userInput.trim() && !isFollowUp ? 0.45 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: PINK_CTA_INK,
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
