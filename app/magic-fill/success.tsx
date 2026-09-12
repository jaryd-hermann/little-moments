import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { MagicFillMomentCollage } from "@/components/magic-fill/MagicFillMomentCollage";
import { useMagicFillStore } from "@/store/magicFillStore";
import { useTabViewIntentStore } from "@/store/tabViewIntentStore";
import { useFirstMomentChatStore } from "@/store/firstMomentChatStore";

export default function MagicFillSuccessScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const savedCount = useMagicFillStore((s) => s.savedCount);
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const drafts = useMagicFillStore((s) => s.drafts);
  const resetForRestart = useMagicFillStore((s) => s.resetForRestart);
  const setMagicFillRatingPrompt = useTabViewIntentStore(
    (s) => s.setMagicFillRatingPrompt
  );

  const savedDrafts = useMemo(
    () =>
      drafts.filter(
        (d) => !d.skipped && d.rawCaption.trim() && d.title && d.body
      ),
    [drafts]
  );

  const fromOnboardingChat = useFirstMomentChatStore(
    (s) => s.awaitingMagicFillReturn
  );

  const handleRestart = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_success_restart", { gap_target: gapTarget });
    resetForRestart();
    router.replace("/magic-fill");
  };

  const handleBackToCapsule = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useMagicFillStore.getState().reset();

    // Launched from the first-moment onboarding chat — drop them back into the
    // conversation rather than into Capsule, and hold the rating prompt until
    // onboarding is actually over.
    if (useFirstMomentChatStore.getState().awaitingMagicFillReturn) {
      useFirstMomentChatStore.getState().returnFromMagicFill();
      router.dismissAll();
      router.replace("/(tabs)/today");
      return;
    }

    setMagicFillRatingPrompt(true);
    router.dismissAll();
    router.replace("/(tabs)/memories");
  };

  return (
    <LinearGradient
      colors={["#1A0B2E", "#0F0718", "#000000"]}
      style={{ flex: 1 }}
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 60,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingHorizontal: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MagicFillMomentCollage
          drafts={savedDrafts}
          borderColor="rgba(255,255,255,0.35)"
          backgroundColor="rgba(255,255,255,0.08)"
          marginBottom={24}
        />

        <Text
          style={magicFillHeadlineStyle({
            fontSize: 48,
            color: "#FFFFFF",
            marginBottom: 4,
          })}
        >
          +{savedCount}
        </Text>
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 32,
            color: "rgba(255,255,255,0.9)",
            marginBottom: 16,
          })}
        >
          moments added
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          Amazing job logging your life like a power journaler. Your Capsule
          just got a whole lot richer.
        </Text>

        <MagicFillPrimaryButton
          label={`Fill ${gapTarget} more moments`}
          variant="pink"
          celebrationShadow
          onPress={handleRestart}
          style={{ alignSelf: "stretch", marginBottom: 16 }}
        />

        {/*
          Mid-onboarding this is the way back into the chat, so it gets a
          proper button rather than a bare text link that reads as decoration.
        */}
        {fromOnboardingChat ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleBackToCapsule}
            style={{
              alignSelf: "stretch",
              height: 52,
              borderRadius: 9999,
              borderWidth: 1.5,
              borderColor: "rgba(255,255,255,0.85)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#FFFFFF",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              I&apos;m done
            </Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={handleBackToCapsule}>
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#FFFFFF",
              }}
            >
              Back to Capsule
            </Text>
          </Pressable>
        )}
      </View>
    </LinearGradient>
  );
}
