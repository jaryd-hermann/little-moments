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
import { Ionicons } from "@expo/vector-icons";
import { AIMessageBubble } from "@/components/dig-deeper/AIMessageBubble";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { ChallengeCard } from "@/components/story-coach/ChallengeCard";
import { MicRecorder } from "@/components/composer/MicRecorder";
import {
  callStoryCoach,
  loadCoachingSession,
  createCoachingSession,
  updateCoachingConversation,
  type CoachingMessage,
  type CoachingSession,
} from "@/lib/storyCoach";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";
import { useTheme } from "@/hooks/useTheme";

const APP_ICON = require("@/assets/images/icon.png");

const CHALLENGE_PATTERN = /\n*\*{0,2}\s*Try this (?:for )?tomorrow:?\s*\*{0,2}\s*/i;

function stripOrphanedMarkers(s: string): string {
  return s.replace(/\*{2,}/g, "").trimEnd();
}

function splitChallenge(text: string): { body: string; challenge: string | null } {
  const match = text.match(CHALLENGE_PATTERN);
  if (!match || match.index === undefined) return { body: text, challenge: null };
  const body = stripOrphanedMarkers(text.slice(0, match.index));
  const challenge = stripOrphanedMarkers(text.slice(match.index + match[0].length));
  if (!challenge) return { body: text, challenge: null };
  return { body, challenge };
}

const REPLY_PLACEHOLDER = "Ask Ellie anything about your story…";
const MIN_REPLY_INPUT_HEIGHT = 48;
const MAX_REPLY_INPUT_HEIGHT = 220;
const REPLY_INPUT_PAD_V = 10;
const REPLY_FIELD_WIDTH_SUBTRACT = 40 + 28;

export default function StoryCoachScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ entryId?: string }>();
  const user = useAuthStore((s) => s.user);
  const entries = useEntryStore((s) => s.entries);

  const entryId = typeof params.entryId === "string" ? params.entryId : undefined;
  const entry = entries.find((e) => e.id === entryId) ?? null;

  const [messages, setMessages] = useState<CoachingMessage[]>([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [micFullscreen, setMicFullscreen] = useState(false);
  const [replyInputHeight, setReplyInputHeight] = useState(MIN_REPLY_INPUT_HEIGHT);

  const scrollRef = useRef<ScrollView>(null);
  const sessionRef = useRef<CoachingSession | null>(null);
  const replyInputHeightRef = useRef(MIN_REPLY_INPUT_HEIGHT);
  const userInputRef = useRef(userInput);
  userInputRef.current = userInput;
  const lastScrollContentHeightRef = useRef(0);
  const [replyInputShellWidth, setReplyInputShellWidth] = useState<number | null>(null);

  const replyFieldWidth = Math.max(
    120,
    replyInputShellWidth ?? Math.floor(windowWidth - REPLY_FIELD_WIDTH_SUBTRACT)
  );

  useEffect(() => {
    if (!entryId || !user) return;
    initSession();
  }, [entryId, user?.id]);

  const initSession = async () => {
    if (!entryId || !user) return;
    setInitializing(true);

    try {
      let session = await loadCoachingSession(entryId);

      if (session && session.conversation?.length > 0) {
        sessionRef.current = session;
        setMessages(session.conversation);
        setInitializing(false);
        return;
      }

      if (!session) {
        session = await createCoachingSession(entryId, user.id);
      }
      sessionRef.current = session;
      setInitializing(false);

      await fetchInitialAnalysis(session);
    } catch {
      setInitializing(false);
      Alert.alert("Error", "Failed to load coaching session.");
    }
  };

  const fetchInitialAnalysis = async (session: CoachingSession) => {
    if (!entry) return;
    setIsLoading(true);

    try {
      const response = await callStoryCoach({
        stage: "initial",
        entry_id: entry.id,
        title: entry.title ?? "",
        body: entry.body,
        original_body: entry.original_body,
      });

      const aiMessage: CoachingMessage = {
        role: "assistant",
        content: response.message,
      };

      const newConversation = [aiMessage];
      setMessages(newConversation);

      await updateCoachingConversation(
        session.id,
        newConversation,
        response.feedback_summary
      );
      sessionRef.current = {
        ...session,
        conversation: newConversation,
        feedback_summary: response.feedback_summary ?? null,
      };
    } catch {
      Alert.alert("Error", "Failed to get coaching feedback. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!userInput.trim() || !sessionRef.current) return;

    const userMessage: CoachingMessage = {
      role: "user",
      content: userInput.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setUserInput("");
    setIsLoading(true);

    try {
      const response = await callStoryCoach({
        stage: "follow_up",
        entry_id: sessionRef.current.entry_id,
        title: entry?.title ?? "",
        body: entry?.body ?? "",
        original_body: entry?.original_body ?? null,
        conversation_history: updatedMessages,
        user_message: userMessage.content,
      });

      const aiMessage: CoachingMessage = {
        role: "assistant",
        content: response.message,
      };

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);

      await updateCoachingConversation(sessionRef.current.id, finalMessages);
      sessionRef.current = {
        ...sessionRef.current,
        conversation: finalMessages,
      };
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
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
                <AIMessageBubble key={i} content={msg.content} role={msg.role} />
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
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Image
              source={APP_ICON}
              style={{ width: 26, height: 26, borderRadius: 6 }}
            />
            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 18,
                color: colors.text,
              }}
            >
              Ellie, your storytelling coach
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          onContentSizeChange={(_w, h) => {
            if (h <= 0 || h === lastScrollContentHeightRef.current) return;
            lastScrollContentHeightRef.current = h;
            scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          {initializing ? (
            <ThinkingDots />
          ) : (
            <>
              {messages.map((msg, i) => {
                if (msg.role === "assistant") {
                  const { body, challenge } = splitChallenge(msg.content);
                  return (
                    <View key={i}>
                      <AIMessageBubble content={body} role="assistant" />
                      {challenge ? <ChallengeCard content={challenge} /> : null}
                    </View>
                  );
                }
                return (
                  <AIMessageBubble key={i} content={msg.content} role={msg.role} />
                );
              })}
              {isLoading && <ThinkingDots />}
            </>
          )}
        </ScrollView>

        {/* Input */}
        {!initializing && (
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
                  onPress={handleSend}
                  disabled={!userInput.trim() || isLoading}
                  hitSlop={6}
                  style={{
                    borderRadius: 9999,
                    backgroundColor: colors.primary,
                    borderWidth: 2,
                    borderColor: "#000000",
                    padding: 11,
                    opacity: !userInput.trim() || isLoading ? 0.45 : 1,
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
