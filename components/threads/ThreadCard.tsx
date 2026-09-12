import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import type { Thread } from "@/hooks/useThreads";
import { ThreadAnswerSheet } from "@/components/threads/ThreadAnswerSheet";
import { launchPremiumFlow } from "@/lib/premiumFlow";
import {
  connectionDotColor,
  isThreadNewSinceTabVisit,
  threadCollageImageUrls,
  threadQuestion,
  threadStatement,
  threadTimeGapLabel,
  THREAD_PEACH_BG,
} from "@/lib/threadDisplay";
import { connectionLabel } from "@/lib/threadOrdinal";

interface ThreadCardProps {
  thread: Thread;
  locked?: boolean;
  /** @deprecated Layout is unified; kept for call-site compatibility. */
  variant?: "full" | "compact";
  /** Show + NEW badge when thread is newer than last Connect tab visit. */
  connectionsTabSeenAt?: string | null;
  onAnswerSaved?: (threadId: string, answer: string) => void;
}

export function ThreadCard({
  thread,
  locked = false,
  connectionsTabSeenAt = null,
  onAnswerSaved,
}: ThreadCardProps) {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const [answerSheetOpen, setAnswerSheetOpen] = useState(false);

  const urls = threadCollageImageUrls(thread);
  const leftUri = urls[0];
  const rightUri = urls[1] ?? urls[0];
  const gap = threadTimeGapLabel(thread);
  const statement = threadStatement(thread);
  const question = threadQuestion(thread);
  const dotColor = connectionDotColor(thread.connection_type);
  const typeLabel = connectionLabel(thread.connection_type);
  const isNew = isThreadNewSinceTabVisit(thread, connectionsTabSeenAt);

  const openDetail = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      launchPremiumFlow(posthog, "thread_card_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
      return;
    }
    router.push(`/threads/${thread.id}`);
  };

  const openAnswer = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (locked) {
      launchPremiumFlow(posthog, "thread_card_locked", {
        bump: { surface: "thread", refId: thread.id },
      });
      return;
    }
    setAnswerSheetOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={openDetail}
        style={{
          borderRadius: 22,
          backgroundColor: "#FFFFFF",
          padding: 6,
          shadowColor: "#000000",
          shadowOffset: { width: 4, height: 5 },
          shadowOpacity: 1,
          shadowRadius: 0,
          elevation: 6,
        }}
      >
        <View
          style={{
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: THREAD_PEACH_BG,
          }}
        >
          <View style={{ height: 160, flexDirection: "row", position: "relative" }}>
            <View style={{ flex: 1 }}>
              {leftUri ? (
                <ExpoImage
                  source={{ uri: leftUri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: "#D8D2CB" }} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              {rightUri ? (
                <ExpoImage
                  source={{ uri: rightUri }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ flex: 1, backgroundColor: "#C8C2BB" }} />
              )}
            </View>
            {gap ? (
              <View
                style={{
                  position: "absolute",
                  alignSelf: "center",
                  top: "50%",
                  marginTop: -14,
                  left: "50%",
                  marginLeft: -52,
                  width: 104,
                  height: 28,
                  borderRadius: 999,
                  backgroundColor: "#0F0F0F",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 11,
                    color: "#FFFFFF",
                  }}
                >
                  {gap}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.55)",
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: dotColor,
                  }}
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    color: "#1A1A1A",
                  }}
                >
                  {typeLabel}
                </Text>
              </View>
              {isNew ? (
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 12,
                    letterSpacing: 0.6,
                    color: "#7B5EA7",
                  }}
                >
                  + NEW
                </Text>
              ) : null}
            </View>

            <Text
              style={{
                fontFamily: "LibreBaskerville-Bold",
                fontSize: 20,
                lineHeight: 26,
                color: "#1A1A1A",
                marginBottom: 12,
              }}
            >
              {statement}
            </Text>

            {question ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  borderRadius: 14,
                  backgroundColor: "rgba(255,255,255,0.55)",
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Roboto-Regular",
                    fontSize: 14,
                    lineHeight: 20,
                    color: "#1A1A1A",
                  }}
                >
                  {question}
                </Text>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openAnswer();
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: "#0F0F0F",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ) : null}
          </View>

          {locked ? (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(255,255,255,0.78)",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Pressable
                onPress={() => {
                  launchPremiumFlow(posthog, "thread_card_locked", {
                    bump: { surface: "thread", refId: thread.id },
                  });
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  backgroundColor: colors.primary,
                }}
              >
                <Ionicons name="lock-closed" size={14} color="#1A1A1A" />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 14,
                    color: "#1A1A1A",
                  }}
                >
                  Upgrade to unlock
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Pressable>

      <ThreadAnswerSheet
        visible={answerSheetOpen}
        thread={thread}
        onClose={() => setAnswerSheetOpen(false)}
        onSaved={(threadId, answer) => onAnswerSaved?.(threadId, answer)}
      />
    </>
  );
}
