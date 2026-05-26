import { useEffect } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { useStreak } from "@/hooks/useStreak";
import { useChapters } from "@/hooks/useChapters";

const WORDMARK_PREMIUM = require("@/assets/images/wordmark-premium.png");

const PREMIUM_FEATURES = [
  { icon: "time", label: "Capsule history beyond 1 year" },
  { icon: "book", label: "Beautiful monthly chapters" },
  { icon: "git-network", label: "Personalized Thread insights" },
  { icon: "infinite", label: "Unlimited moment capturing" },
  { icon: "chatbubble-ellipses", label: "Unlimited Ellie to help" },
  { icon: "heart", label: "5% donated for you" },
];

const PREMIUM_CTA_BG = "#FECFB4";

export default function UpgradeScreen() {
  const { colors } = useTheme();
  const { fromOnboarding } = useLocalSearchParams<{ fromOnboarding?: string }>();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { totalMoments } = useStreak();
  const { chapters } = useChapters();

  useEffect(() => {
    posthog.capture("paywall_features_viewed", {
      total_moments: totalMoments,
      total_chapters: chapters.length,
      from_onboarding: fromOnboarding === "1",
      ...(fromOnboarding === "1" ? onboardingEventProps(7) : {}),
    });
  }, [chapters.length, fromOnboarding, posthog, totalMoments]);

  const handleContinue = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("paywall_features_continue_tapped");
    router.push({
      pathname: "/paywall/cause",
      params: { fromOnboarding: fromOnboarding === "1" ? "1" : "0" },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable
        onPress={() => {
          posthog.capture("paywall_dismissed", { step: "features" });
          if (fromOnboarding === "1") {
            posthog.capture(
              "onboarding_paywall_skipped",
              onboardingEventProps(7, { dismiss_step: "features" })
            );
            router.replace("/(tabs)/today");
          } else {
            router.back();
          }
        }}
        style={{ position: "absolute", right: 16, top: 56, zIndex: 10 }}
        hitSlop={8}
      >
        <Ionicons name="close" size={24} color={colors.textMuted} />
      </Pressable>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 48,
          paddingBottom: 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 26,
            color: colors.text,
            textAlign: "center",
            lineHeight: 34,
          }}
        >
          Your memories are adding up
        </Text>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            marginTop: 28,
            paddingVertical: 20,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSecondary,
          }}
        >
          <StatBlock label="moments" value={totalMoments} colors={colors} />
          <StatBlock label="chapters" value={chapters.length} colors={colors} />
          <StatBlock label="threads" value={0} colors={colors} />
        </View>

        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            lineHeight: 24,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 24,
          }}
        >
          You've been showing up. Now unlock the full power of your memory
          collection.
        </Text>

        <View style={{ marginTop: 28, gap: 16 }}>
          {PREMIUM_FEATURES.map((f) => (
            <View
              key={f.label}
              style={{ flexDirection: "row", alignItems: "center", gap: 14 }}
            >
              <Ionicons
                name={f.icon as keyof typeof Ionicons.glyphMap}
                size={22}
                color={PREMIUM_CTA_BG}
              />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  color: colors.text,
                  flex: 1,
                }}
              >
                {f.label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1,
          borderTopColor: colors.border,
          alignItems: "center",
        }}
      >
        <Image
          source={WORDMARK_PREMIUM}
          style={{ height: 32, width: 200, marginBottom: 14 }}
          contentFit="contain"
        />
        <Pressable
          onPress={handleContinue}
          style={{
            height: 52,
            width: "100%",
            borderRadius: 9999,
            backgroundColor: PREMIUM_CTA_BG,
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
            Unlock Premium
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StatBlock({
  label,
  value,
  colors,
}: {
  label: string;
  value: number;
  colors: any;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text
        style={{
          fontFamily: "LibreBaskerville-Bold",
          fontSize: 28,
          color: colors.text,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: "Roboto-Light",
          fontSize: 12,
          color: colors.textMuted,
          marginTop: 2,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
