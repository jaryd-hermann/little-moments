import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { usePostHog } from "posthog-react-native";
import { Ionicons } from "@expo/vector-icons";
import { AIMessageBubble } from "@/components/dig-deeper/AIMessageBubble";
import { EnhancedCard } from "@/components/dig-deeper/AIConversation";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { MicRecorder } from "@/components/composer/MicRecorder";
import { callDigDeeper } from "@/lib/anthropic";
import { setDigDeeperPendingResult } from "@/lib/digDeeperReturn";
import { useTheme } from "@/hooks/useTheme";
import { useEntries } from "@/hooks/useEntries";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Stage =
  | "initial"
  | "answering"
  | "following_up"
  | "enhancing"
  | "enhanced"
  | "revising";

/** Number of agent question rounds before enhancement. One question, then preview. */
const CONVERSATION_ROUNDS = 1;

/**
 * Strip conversational preamble/postamble wrapping the actual story.
 * e.g. "I love that detail! Here's your revised story:\n\n[STORY]\n\nWhat else would you like?"
 * → returns just [STORY]
 */
function cleanEnhancedBody(text: string): string {
  let cleaned = text;

  const markerRe =
    /(?:here'?s?\s+(?:your|the)\s+(?:story|enhanced|revised|updated|new)\s*(?:story|version|moment)?)[:\s\u2014\u2013-]*/gi;
  let lastEnd = 0;
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(cleaned)) !== null) {
    lastEnd = m.index + m[0].length;
  }
  if (lastEnd > 0) cleaned = cleaned.slice(lastEnd);

  const paras = cleaned.split(/\n\n+/);
  while (paras.length > 1) {
    const last = paras[paras.length - 1].trim();
    if (
      last.includes("?") ||
      /^(what|would|let me|anything|how|want|shall|feel free|if you)/i.test(last)
    ) {
      paras.pop();
    } else {
      break;
    }
  }

  return paras.join("\n\n").trim() || text.trim();
}

const REPLY_PLACEHOLDER = "Build this moment, make your story";

/** Min height fits one line + vertical padding (avoid fixed lineHeight on TextInput — it breaks wrap/cursor on iOS). */
const MIN_REPLY_INPUT_HEIGHT = 48;
const MAX_REPLY_INPUT_HEIGHT = 220;
const REPLY_INPUT_PAD_V = 10;

/** Horizontal padding: composer outer 20×2 + bordered inner 14×2 (TextInput sits in inner content). */
const REPLY_FIELD_WIDTH_SUBTRACT = 40 + 28;

const APP_ICON = require("@/assets/images/white-icon.png");

/** Soft closer rendered in violet italic via AIMessageBubble's `_..._` markup. */
const INITIAL_TRAILER = "_Any of this is interesting._";

export default function DigDeeperScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{
    title?: string;
    body?: string;
    isCrashAndBurn?: string;
    entryId?: string;
    photoUri?: string;
  }>();
  const { editEntry } = useEntries();

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [stage, setStage] = useState<Stage>("initial");
  const [enhancedBody, setEnhancedBody] = useState("");
  const [enhancedTitle, setEnhancedTitle] = useState("");
  const [prevEnhancedBody, setPrevEnhancedBody] = useState("");
  const [revisionStartIdx, setRevisionStartIdx] = useState<number | null>(null);
  const [revisionRound, setRevisionRound] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [round, setRound] = useState(0);
  const [micFullscreen, setMicFullscreen] = useState(false);
  const [replyInputHeight, setReplyInputHeight] = useState(
    MIN_REPLY_INPUT_HEIGHT
  );
  const scrollRef = useRef<ScrollView>(null);
  const conversationHistory = useRef<Message[]>([]);
  /** Prevents onContentSizeChange ↔ setState feedback loops (flashing placeholder, frozen touches). */
  const replyInputHeightRef = useRef(MIN_REPLY_INPUT_HEIGHT);
  const userInputRef = useRef(userInput);
  userInputRef.current = userInput;
  const lastScrollContentHeightRef = useRef(0);
  /** Measured shell width; fallback uses window so modals/sheets still get a real pixel width before layout. */
  const [replyInputShellWidth, setReplyInputShellWidth] = useState<
    number | null
  >(null);

  const replyFieldWidth = Math.max(
    120,
    replyInputShellWidth ??
      Math.floor(windowWidth - REPLY_FIELD_WIDTH_SUBTRACT)
  );

  useEffect(() => {
    posthog.capture("started_dig_deeper");
    fetchInitialAnalysis();
  }, []);

  const fetchInitialAnalysis = async () => {
    setIsLoading(true);
    try {
      const response = await callDigDeeper({
        stage: "initial",
        title: params.title ?? "",
        body: params.body ?? "",
        is_crash_and_burn: params.isCrashAndBurn === "true",
      });

      const aiMessage: Message = {
        role: "assistant",
        content: `${response.message.trim()}\n\n${INITIAL_TRAILER}`,
      };
      setMessages([aiMessage]);
      conversationHistory.current = [aiMessage];
      setStage("answering");
      setRound(1);
    } catch {
      Alert.alert("Error", "Failed to connect to AI. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!userInput.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: userInput.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    conversationHistory.current = [
      ...conversationHistory.current,
      userMessage,
    ];
    setUserInput("");
    setIsLoading(true);

    const nextRound = round + 1;
    const isEnhanceRound = nextRound > CONVERSATION_ROUNDS;
    setStage(isEnhanceRound ? "enhancing" : "following_up");

    try {
      const response = await callDigDeeper({
        stage: isEnhanceRound ? "enhance" : "follow_up",
        title: params.title ?? "",
        body: params.body ?? "",
        is_crash_and_burn: params.isCrashAndBurn === "true",
        conversation_history: conversationHistory.current,
        user_answers: userMessage.content,
        round: nextRound,
      });

      const aiMessage: Message = {
        role: "assistant",
        content: response.message,
      };
      setMessages((prev) => [...prev, aiMessage]);
      conversationHistory.current = [
        ...conversationHistory.current,
        aiMessage,
      ];

      if (isEnhanceRound && response.enhanced_body) {
        setEnhancedBody(cleanEnhancedBody(response.enhanced_body));
        setEnhancedTitle(response.enhanced_title ?? "");
        setStage("enhanced");
      } else if (isEnhanceRound && !response.enhanced_body) {
        setRound(nextRound);
        setStage("answering");
      } else {
        setRound(nextRound);
        setStage("answering");
      }
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
      setStage("answering");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    // If invoked with an entryId, update that entry directly (post-save Dig Deeper flow).
    if (params.entryId) {
      try {
        await editEntry(params.entryId, {
          title: enhancedTitle || params.title || "",
          body: enhancedBody,
          ai_conversation: { messages: conversationHistory.current },
          original_body: params.body ?? null,
          ai_enhanced_body: enhancedBody,
          is_ai_enhanced: true,
        });
      } catch {
        Alert.alert("Update failed", "Could not save changes. Please try again.");
        return;
      }
      router.back();
      return;
    }
    setDigDeeperPendingResult({
      enhancedBody,
      enhancedTitle,
      originalBody: params.body ?? "",
      originalTitle: params.title ?? "",
      aiConversationJson: JSON.stringify(conversationHistory.current),
    });
    router.back();
  };

  const handleAskChanges = async () => {
    setPrevEnhancedBody(enhancedBody);
    setEnhancedBody("");
    setRevisionStartIdx(messages.length);

    const enhancedContextMessage: Message = {
      role: "assistant",
      content: `[ENHANCED STORY GENERATED]\n\n${enhancedBody}`,
    };
    conversationHistory.current = [
      ...conversationHistory.current,
      enhancedContextMessage,
    ];

    // Post-save Dig Deeper (entryId): single-question loop. Fetch a fresh question
    // from Ellie and skip ahead so the next send goes straight to revise.
    if (params.entryId) {
      setRevisionRound(1);
      setStage("revising");
      setUserInput("");
      setIsLoading(true);
      try {
        const response = await callDigDeeper({
          stage: "follow_up",
          title: enhancedTitle || params.title || "",
          body: enhancedBody,
          is_crash_and_burn: params.isCrashAndBurn === "true",
          conversation_history: conversationHistory.current,
          round: 1,
        });
        const aiMessage: Message = {
          role: "assistant",
          content: response.message,
        };
        setMessages((prev) => [...prev, aiMessage]);
        conversationHistory.current = [
          ...conversationHistory.current,
          aiMessage,
        ];
      } catch {
        const fallback: Message = {
          role: "assistant",
          content: "What else feels worth saying about this moment?",
        };
        setMessages((prev) => [...prev, fallback]);
        conversationHistory.current = [
          ...conversationHistory.current,
          fallback,
        ];
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setRevisionRound(0);

    const promptMessage: Message = {
      role: "assistant",
      content:
        "What would you like to edit? Facts, tone? Let me know and we'll make it fully yours.",
    };
    setMessages((prev) => [...prev, promptMessage]);
    conversationHistory.current = [
      ...conversationHistory.current,
      promptMessage,
    ];
    setStage("revising");
    setUserInput("");
  };

  const handleSendRevision = async () => {
    if (!userInput.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: userInput.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    conversationHistory.current = [
      ...conversationHistory.current,
      userMessage,
    ];
    setUserInput("");
    setIsLoading(true);

    const nextRevisionRound = revisionRound + 1;
    const isReviseRound = nextRevisionRound > 1;

    try {
      const response = await callDigDeeper({
        stage: isReviseRound ? "revise" : "follow_up",
        title: params.title ?? "",
        body: isReviseRound && prevEnhancedBody ? prevEnhancedBody : (params.body ?? ""),
        is_crash_and_burn: params.isCrashAndBurn === "true",
        conversation_history: conversationHistory.current,
        ...(isReviseRound
          ? { revision_request: userMessage.content }
          : { user_answers: userMessage.content, round: nextRevisionRound }),
      });

      const aiMessage: Message = {
        role: "assistant",
        content: response.message,
      };
      setMessages((prev) => [...prev, aiMessage]);
      conversationHistory.current = [
        ...conversationHistory.current,
        aiMessage,
      ];

      if (isReviseRound && response.enhanced_body) {
        setEnhancedBody(cleanEnhancedBody(response.enhanced_body));
        setEnhancedTitle(response.enhanced_title ?? enhancedTitle);
        setStage("enhanced");
      } else if (isReviseRound && !response.enhanced_body) {
        setRevisionRound(nextRevisionRound);
        setStage("revising");
      } else {
        setRevisionRound(nextRevisionRound);
        setStage("revising");
      }
    } catch {
      Alert.alert("Error", "Failed to revise. Please try again.");
      setStage("revising");
    } finally {
      setIsLoading(false);
    }
  };

  if (micFullscreen) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: colors.background }}
        edges={["top"]}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <View
            style={{
              flex: 1,
              opacity: 0.35,
              paddingHorizontal: 16,
              paddingTop: 8,
            }}
            pointerEvents="none"
          >
            <ScrollView>
              {messages.map((msg, i) => (
                <AIMessageBubble
                  key={i}
                  content={msg.content}
                  role={msg.role}
                />
              ))}
            </ScrollView>
          </View>
          <View
            style={{
              height: "50%",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              overflow: "hidden",
            }}
          >
            <MicRecorder
              fullscreen
              onTranscription={(text) => {
                setUserInput((prev) => (prev ? `${prev} ${text}` : text));
                setMicFullscreen(false);
              }}
              onCancel={() => setMicFullscreen(false)}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              ← Back
            </Text>
          </Pressable>
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 22,
              color: colors.text,
            }}
          >
            Dig Deeper
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.textSecondary,
              }}
            >
              Done
            </Text>
          </Pressable>
        </View>

        {/* Moment context card — shows what we're digging into */}
        {(params.title || params.body) && (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 4,
              marginBottom: 8,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            {params.title ? (
              <Text
                style={{
                  fontFamily: "LibreBaskerville-Bold",
                  fontSize: 15,
                  color: colors.text,
                  marginBottom: 4,
                }}
                numberOfLines={1}
              >
                {params.title}
              </Text>
            ) : null}
            {params.body ? (
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 13,
                  color: colors.textSecondary,
                }}
                numberOfLines={1}
              >
                {(params.body ?? "").trim()}
              </Text>
            ) : null}
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          onContentSizeChange={(_w, h) => {
            if (h <= 0 || h === lastScrollContentHeightRef.current) return;
            lastScrollContentHeightRef.current = h;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {(revisionStartIdx != null
            ? messages.slice(0, revisionStartIdx)
            : messages
          ).map((msg, i) => (
            <AIMessageBubble
              key={i}
              content={msg.content}
              role={msg.role}
            />
          ))}

          {prevEnhancedBody && (
            <EnhancedCard
              enhancedBody={prevEnhancedBody}
              readonly
            />
          )}

          {revisionStartIdx != null &&
            messages.slice(revisionStartIdx).map((msg, i) => (
              <AIMessageBubble
                key={`rev-${i}`}
                content={msg.content}
                role={msg.role}
              />
            ))}

          {isLoading && <ThinkingDots />}

          {stage === "enhanced" && enhancedBody && (
            <EnhancedCard
              enhancedBody={enhancedBody}
              enhancedTitle={enhancedTitle || params.title}
              onAccept={handleAccept}
              onAskChanges={handleAskChanges}
              acceptLabel={params.entryId ? "UPDATE MOMENT" : undefined}
              askChangesLabel={params.entryId ? "Go deeper" : undefined}
              photoUri={params.photoUri || undefined}
              hideEyebrow={Boolean(params.entryId)}
            />
          )}
        </ScrollView>

        {(stage === "answering" || stage === "revising") && (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 12),
            }}
          >
            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.background,
                paddingHorizontal: 14,
                paddingTop: 12,
                paddingBottom: 10,
                alignSelf: "stretch",
              }}
            >
              <View
                collapsable={false}
                style={{ width: "100%", alignSelf: "stretch" }}
                onLayout={({ nativeEvent }) => {
                  const w = Math.round(nativeEvent.layout.width);
                  if (w <= 0) return;
                  setReplyInputShellWidth((prev) => (prev === w ? prev : w));
                }}
              >
                <TextInput
                  value={userInput}
                  onChangeText={setUserInput}
                  placeholder={REPLY_PLACEHOLDER}
                  placeholderTextColor={colors.textMuted}
                  multiline
                  scrollEnabled
                  textAlignVertical="top"
                  underlineColorAndroid="transparent"
                  submitBehavior="newline"
                  onContentSizeChange={(e) => {
                    const empty = userInputRef.current.length === 0;
                    const h = e.nativeEvent.contentSize.height;
                    const next = empty
                      ? MIN_REPLY_INPUT_HEIGHT
                      : Math.min(
                          MAX_REPLY_INPUT_HEIGHT,
                          Math.max(
                            MIN_REPLY_INPUT_HEIGHT,
                            Math.ceil(h + REPLY_INPUT_PAD_V * 2)
                          )
                        );
                    if (next === replyInputHeightRef.current) return;
                    replyInputHeightRef.current = next;
                    setReplyInputHeight(next);
                  }}
                  style={{
                    width: replyFieldWidth,
                    maxWidth: "100%",
                    height: replyInputHeight,
                    paddingVertical: REPLY_INPUT_PAD_V,
                    paddingHorizontal: 4,
                    fontFamily: "Roboto-Regular",
                    fontSize: 15,
                    color: colors.text,
                    backgroundColor: "transparent",
                    ...(Platform.OS === "android"
                      ? {
                          includeFontPadding: false,
                          textBreakStrategy: "simple",
                        }
                      : null),
                  }}
                />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 10,
                  minHeight: 44,
                }}
              >
                <Pressable
                  onPress={() => setMicFullscreen(true)}
                  hitSlop={6}
                  style={{
                    borderRadius: 10,
                    backgroundColor: colors.surfaceSecondary,
                    padding: 11,
                  }}
                >
                  <Ionicons name="mic-outline" size={22} color={colors.icon} />
                </Pressable>
                <Pressable
                  onPress={
                    stage === "revising"
                      ? handleSendRevision
                      : handleSendAnswer
                  }
                  disabled={!userInput.trim()}
                  hitSlop={6}
                  style={{
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: "#000000",
                    padding: 11,
                    opacity: !userInput.trim() ? 0.45 : 1,
                  }}
                >
                  <Ionicons name="send" size={18} color="#000000" />
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
