import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { useStreak } from "@/hooks/useStreak";
import { EllieMessage } from "@/components/ellie/EllieMessage";
import { ThinkingDots } from "@/components/dig-deeper/ThinkingDots";
import { CauseGrid } from "@/components/donation/CauseGrid";
import { supabase } from "@/lib/supabase";
import type { DonationCause } from "@/constants/donationCauses";

const WORDMARK = require("@/assets/images/wordmark-premium.png");
const CTA_LAVENDER = "#F0D7FF";

type AnsweredTopic = "right_for_me" | "causes" | "price" | "threads_chapters";

export default function ElliePremiumScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const profile = useAuthStore((s) => s.profile);
  const { totalMoments } = useStreak();
  const scrollRef = useRef<ScrollView>(null);

  const firstName =
    profile?.display_name?.split(" ")[0] ??
    profile?.email?.split("@")[0] ??
    "there";

  // ---------- chat state ----------
  const [phase, setPhase] = useState<
    "greeting" | "thinking" | "explainer" | "causes_grid" | "choices" | "answering" | "done"
  >("greeting");
  const [answered, setAnswered] = useState<Set<AnsweredTopic>>(new Set());
  const [topicResponses, setTopicResponses] = useState<
    { topic: AnsweredTopic; message: string }[]
  >([]);

  // ---------- cause data ----------
  const [causes, setCauses] = useState<DonationCause[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("donation_causes")
        .select("*")
        .order("sort_order");
      if (data) setCauses(data as DonationCause[]);
    })();
  }, []);

  useEffect(() => {
    posthog.capture("premium_chat_opened");
  }, []);

  // ---------- timed phase progression ----------
  useEffect(() => {
    if (phase === "greeting") {
      const t = setTimeout(() => setPhase("thinking"), 600);
      return () => clearTimeout(t);
    }
    if (phase === "thinking") {
      const t = setTimeout(() => setPhase("explainer"), 2500);
      return () => clearTimeout(t);
    }
    if (phase === "explainer") {
      const t = setTimeout(() => setPhase("causes_grid"), 400);
      return () => clearTimeout(t);
    }
    if (phase === "causes_grid") {
      const t = setTimeout(() => setPhase("choices"), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  useEffect(() => {
    if (topicResponses.length === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [topicResponses.length]);

  // ---------- choice handling ----------
  const remainingChoices = useCallback(() => {
    const all: { id: AnsweredTopic; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { id: "right_for_me", label: "Is premium right for me?", icon: "sparkles" },
      { id: "threads_chapters", label: "Explain Threads and Chapters more", icon: "layers" },
      { id: "causes", label: "Tell me more about causes", icon: "heart" },
      { id: "price", label: "Price and cancellation", icon: "pricetag" },
    ];
    return all.filter((c) => !answered.has(c.id));
  }, [answered]);

  const buildTopicResponse = (topic: AnsweredTopic): string => {
    switch (topic) {
      case "right_for_me": {
        if (totalMoments > 10) {
          return (
            `You've captured **${totalMoments} moments** so far — that's a real collection building up. ` +
            `If you care about looking back on these in a few years, premium keeps them safe with unlimited history. ` +
            `You'll also get unlimited Thread connections and deep insights across all your moments, ` +
            `plus beautiful monthly Chapters that organize everything into stories.\n\n` +
            `Honestly? With ${totalMoments} moments, you're already getting a lot out of Little Moments. ` +
            `Premium would unlock the full picture.`
          );
        }
        return (
          `You've captured **${totalMoments} moment${totalMoments !== 1 ? "s" : ""}** so far. ` +
          `That's a great start! At this stage, the free plan gives you plenty of room — ` +
          `unlimited captures, up to a year of history, and 3 Thread connections.\n\n` +
          `Once you've built up more moments and started using Threads, you'll really feel the difference ` +
          `premium makes — unlimited history, unlimited Threads and insights, and beautiful monthly Chapters. ` +
          `There's no rush, but keep it in mind as your collection grows.`
        );
      }
      case "causes":
        return (
          `Every premium membership contributes to real change. **5% of every membership payment** goes to a cause you pick.\n\n` +
          `We partner with **Every.org**, a trusted nonprofit platform, to make sure donations reach the right place. ` +
          `You choose your cause when you sign up for premium, and you can change it anytime in your settings.\n\n` +
          `We include causes in Little Moments because capturing memories is about what matters to you — ` +
          `and giving back is part of that. It's a small way your subscription makes the world a little better too.`
        );
      case "threads_chapters":
        return (
          `Great question — these are two of the most powerful premium features.\n\n` +
          `**Threads** are intelligent connections between your moments. As you capture more, ` +
          `Little Moments starts noticing patterns — recurring people, places, feelings, and themes. ` +
          `Threads surface these connections and give you personalized insights about your life that you might not see yourself. ` +
          `Free users get 3 Thread connections to try it out. Premium unlocks unlimited Threads across all your moments.\n\n` +
          `**Chapters** are beautiful monthly stories created from your moments and photos. ` +
          `At the end of each month, your moments are woven into a narrated story — almost like a personal journal entry ` +
          `written about your life. They're a really meaningful way to look back on a month and remember what mattered. ` +
          `Chapters are a premium-only feature.`
        );
      case "price":
        return (
          `Premium is **$10/month** or **$100/year** (save $20). ` +
          `You can cancel anytime — no commitments, no questions asked. ` +
          `If you cancel, you keep premium access through the end of your billing period.`
        );
    }
  };

  const handleChoiceSelect = (id: string) => {
    const topic = id as AnsweredTopic;
    if (answered.has(topic)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    posthog.capture("premium_chat_topic_tapped", { topic });

    const response = buildTopicResponse(topic);
    const next = new Set(answered);
    next.add(topic);
    setAnswered(next);
    setTopicResponses((prev) => [...prev, { topic, message: response }]);

    if (next.size >= 4) {
      setPhase("done");
    }
  };

  const handleGetPremium = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("premium_chat_get_premium_tapped", {
      topics_viewed: Array.from(answered),
    });
    router.push("/paywall/upgrade");
  };

  const handleDismiss = () => {
    posthog.capture("premium_chat_dismissed", {
      topics_viewed: Array.from(answered),
    });
    router.back();
  };

  // ---------- render helpers ----------
  const greetingText =
    `Hey ${firstName}. Thanks for thinking about upgrading to premium. ` +
    `This is not a hard sell — let's see if going premium is right for you.`;

  const explainerText =
    `Here's how it breaks down:\n\n` +
    `**Free** includes unlimited moment captures, up to 1 year of moments saved in your capsule, ` +
    `and 3 free Thread connections.\n\n` +
    `**Premium** is for people who care about longer-term history — unlimited insights and Threads across ` +
    `all your moments, beautiful monthly Chapters organizing your moments and images into stories, and unlimited history.`;

  const causeNoteText =
    `It's also worth noting that premium members contribute to our **5% pledge**. ` +
    `You pick a cause you care about, and 5% of membership sales go there every month.`;

  const choiceLabels: Record<AnsweredTopic, string> = {
    right_for_me: "Is premium right for me?",
    threads_chapters: "Explain Threads and Chapters more",
    causes: "Tell me more about causes",
    price: "Price and cancellation",
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Image
          source={WORDMARK}
          style={{ height: 36, width: 220 }}
          contentFit="contain"
        />
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          style={{ position: "absolute", right: 16 }}
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Chat area */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Greeting */}
        <EllieMessage content={greetingText} showAvatar />

        {/* Thinking dots */}
        {phase === "thinking" && <ThinkingDots />}

        {/* Explainer */}
        {(phase === "explainer" ||
          phase === "causes_grid" ||
          phase === "choices" ||
          phase === "answering" ||
          phase === "done") && (
          <EllieMessage content={explainerText} showAvatar />
        )}

        {/* Cause note + grid */}
        {(phase === "causes_grid" ||
          phase === "choices" ||
          phase === "answering" ||
          phase === "done") && (
          <>
            <EllieMessage content={causeNoteText} showAvatar />
            {causes.length > 0 && (
              <View style={{ marginBottom: 20, marginLeft: -20, marginRight: -20 }}>
                <CauseGrid
                  causes={causes}
                  selectedId={null}
                  onSelect={() => {}}
                />
              </View>
            )}
          </>
        )}

        {/* Topic responses (answered so far) */}
        {topicResponses.map((r, i) => (
          <View key={r.topic}>
            {/* Show the user's "choice" as a right-aligned pill */}
            <View
              style={{
                alignSelf: "flex-end",
                backgroundColor: colors.primary,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginBottom: 12,
                maxWidth: "85%",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  color: "#1A1A1A",
                }}
              >
                {choiceLabels[r.topic]}
              </Text>
            </View>
            <EllieMessage content={r.message} showAvatar />
          </View>
        ))}

        {/* Choice buttons (remaining) */}
        {(phase === "choices" || phase === "answering" || phase === "done") &&
          remainingChoices().length > 0 && (
            <View style={{ gap: 10, marginBottom: 16 }}>
              {remainingChoices().map((choice) => (
                <Pressable
                  key={choice.id}
                  onPress={() => handleChoiceSelect(choice.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 14,
                    borderWidth: 1.5,
                    borderColor: colors.primary,
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    gap: 12,
                  }}
                >
                  <Ionicons name={choice.icon} size={20} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Roboto-Medium",
                        fontSize: 15,
                        color: colors.text,
                      }}
                    >
                      {choice.label}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}
      </ScrollView>

      {/* Sticky CTA */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Pressable
          onPress={handleGetPremium}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: CTA_LAVENDER,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#1A1A1A",
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}
          >
            Get Premium
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
