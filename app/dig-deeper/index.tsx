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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { AIMessageBubble } from "@/components/dig-deeper/AIMessageBubble";
import {
  EnhancedCard,
  LoadingBubble,
} from "@/components/dig-deeper/AIConversation";
import { callDigDeeper } from "@/lib/anthropic";
import { useTheme } from "@/hooks/useTheme";

interface Message {
  role: "user" | "assistant";
  content: string;
}

type Stage = "initial" | "answering" | "following_up" | "enhancing" | "enhanced" | "revising";

const MIN_ROUNDS = 2;

export default function DigDeeperScreen() {
  const { colors, theme } = useTheme();
  const params = useLocalSearchParams<{
    title?: string;
    body?: string;
    isCrashAndBurn?: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [stage, setStage] = useState<Stage>("initial");
  const [enhancedBody, setEnhancedBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [round, setRound] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const conversationHistory = useRef<Message[]>([]);

  useEffect(() => {
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
        content: response.message,
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

    if (nextRound > MIN_ROUNDS) {
      setStage("enhancing");
      try {
        const response = await callDigDeeper({
          stage: "enhance",
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
        setEnhancedBody(response.enhanced_body ?? response.message);
        setStage("enhanced");
      } catch {
        Alert.alert("Error", "Failed to generate enhancement.");
        setStage("answering");
      } finally {
        setIsLoading(false);
      }
    } else {
      setStage("following_up");
      try {
        const response = await callDigDeeper({
          stage: "follow_up",
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
        setRound(nextRound);
        setStage("answering");
      } catch {
        Alert.alert("Error", "Failed to get follow-up questions.");
        setStage("answering");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleAccept = () => {
    router.back();
    router.setParams({
      enhancedBody,
      aiConversation: JSON.stringify(conversationHistory.current),
    });
  };

  const handleAskChanges = () => {
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

    try {
      const response = await callDigDeeper({
        stage: "revise",
        title: params.title ?? "",
        body: params.body ?? "",
        is_crash_and_burn: params.isCrashAndBurn === "true",
        conversation_history: conversationHistory.current,
        revision_request: userMessage.content,
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
      setEnhancedBody(response.enhanced_body ?? response.message);
      setStage("enhanced");
    } catch {
      Alert.alert("Error", "Failed to revise. Please try again.");
      setStage("enhanced");
    } finally {
      setIsLoading(false);
    }
  };

  const getLoadingText = () => {
    switch (stage) {
      case "initial":
        return "Reading your moment...";
      case "following_up":
        return "Thinking...";
      case "enhancing":
        return "Crafting your story...";
      default:
        return "Revising...";
    }
  };

  const getPlaceholder = () => {
    if (stage === "revising") return "What would you like to change?";
    if (round === 1) return "Answer the questions above...";
    return "Tell me more...";
  };

  return (
    <SafeAreaView className="flex-1 bg-black">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
          <View style={{ width: 24 }} />
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 18,
              color: colors.text,
            }}
          >
            Dig Deeper
          </Text>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="close" size={24} color={colors.icon} />
          </Pressable>
        </View>

        {/* Round indicator */}
        {stage !== "enhanced" && round > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 8,
            }}
          >
            {Array.from({ length: MIN_ROUNDS + 1 }, (_, i) => (
              <View
                key={i}
                style={{
                  width: i + 1 <= round ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    i + 1 <= round
                      ? colors.primary
                      : colors.border,
                }}
              />
            ))}
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5 pt-4"
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
        >
          {messages.map((msg, i) => (
            <AIMessageBubble
              key={i}
              content={msg.content}
              role={msg.role}
            />
          ))}

          {isLoading && <LoadingBubble text={getLoadingText()} />}

          {stage === "enhanced" && enhancedBody && (
            <EnhancedCard
              enhancedBody={enhancedBody}
              onAccept={handleAccept}
              onAskChanges={handleAskChanges}
            />
          )}
        </ScrollView>

        {/* Input */}
        {(stage === "answering" || stage === "revising") && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 8,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <TextInput
              value={userInput}
              onChangeText={setUserInput}
              placeholder={getPlaceholder()}
              placeholderTextColor={colors.border}
              multiline
              style={{
                flex: 1,
                maxHeight: 96,
                borderRadius: 12,
                backgroundColor: colors.surface,
                paddingHorizontal: 16,
                paddingVertical: 12,
                fontFamily: "Roboto-Regular",
                fontSize: 15,
                color: colors.text,
              }}
            />
            <Pressable
              onPress={
                stage === "revising"
                  ? handleSendRevision
                  : handleSendAnswer
              }
              disabled={!userInput.trim()}
              style={{
                marginBottom: 2,
                borderRadius: 9999,
                backgroundColor:
                  theme === "dark" ? "#FFFFFF" : "#1A1A1A",
                padding: 12,
                opacity: !userInput.trim() ? 0.5 : 1,
              }}
            >
              <Ionicons
                name="send"
                size={18}
                color={theme === "dark" ? "#000000" : "#FFFFFF"}
              />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
