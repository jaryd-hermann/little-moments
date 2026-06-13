import { GalleryMontageBackground } from "@/components/onboarding/GalleryMontageBackground";
import { resolveOnboardingFirstCaptureTarget } from "@/lib/onboardingFirstCaptureTarget";
import { setFirstCaptureAsset } from "@/lib/onboardingHandoff";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { queryRecentCameraPhotos } from "@/hooks/useMediaLibrary";
import { useOnboardingMontageStore } from "@/store/onboardingMontageStore";
import { useTheme } from "@/hooks/useTheme";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { usePostHog } from "posthog-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ScreenStep = "intro" | "ready";

export default function FirstMomentScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const montageAssets = useOnboardingMontageStore((s) => s.assets);
  const setMontageAssets = useOnboardingMontageStore((s) => s.setAssets);
  const [step, setStep] = useState<ScreenStep>("intro");
  const [targetYmd, setTargetYmd] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string>("");
  const [subcopy, setSubcopy] = useState<string>(
    "This is the first little moment in your story, and we'll do it fast"
  );
  const [cta, setCta] = useState("Let's do it");
  const [loadingTarget, setLoadingTarget] = useState(false);

  useEffect(() => {
    posthog.capture("viewed_first_moment_onboarding", onboardingEventProps(7));
  }, [posthog]);

  useEffect(() => {
    if (montageAssets.length > 0) return;
    void queryRecentCameraPhotos({ daysBack: 30, limit: 20 }).then(setMontageAssets);
  }, [montageAssets.length, setMontageAssets]);

  const ctaLabel = step === "intro" ? cta : "Start my story";

  const handleIntroContinue = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoadingTarget(true);
    try {
      const target = await resolveOnboardingFirstCaptureTarget();
      setTargetYmd(target.targetYmd);
      if (target.earliestAsset) {
        setFirstCaptureAsset(target.earliestAsset);
      }
      if (target.todayPhotoCount > 0) {
        setHeadline("We've found 3 photos from today, you'll pick one");
      } else if (target.fallbackDayLabel) {
        setHeadline(`No photos from today, so we'll do ${target.fallbackDayLabel}`);
      } else {
        setHeadline("Let's capture your first moment quickly");
      }
      setSubcopy(
        "In under 60s, speak or type as much or little as you like"
      );
      setCta("Start my story");
      setStep("ready");
      posthog.capture("first_moment_target_resolved", {
        ...onboardingEventProps(7),
        target_ymd: target.targetYmd,
        today_photo_count: target.todayPhotoCount,
        has_fallback_day: Boolean(target.fallbackDayLabel),
      });
    } finally {
      setLoadingTarget(false);
    }
  };

  const handleStartStory = () => {
    if (!targetYmd) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("first_moment_start_story_tapped", {
      ...onboardingEventProps(7),
      target_ymd: targetYmd,
    });
    router.replace({
      pathname: "/(tabs)/today",
      params: {
        capture: "1",
        onboardingFirstMoment: "1",
        day: targetYmd,
      },
    });
  };

  const title = useMemo(() => {
    if (step === "intro") {
      return "Let's capture your first moment quickly";
    }
    return headline || "Let's capture your first moment quickly";
  }, [step, headline]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <GalleryMontageBackground assets={montageAssets} />

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + 8,
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          key={step}
          entering={FadeInDown.duration(450).delay(60)}
        >
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 30,
              lineHeight: 38,
              color: "#FFFFFF",
              textAlign: "center",
              textShadowColor: "rgba(0,0,0,0.5)",
              textShadowOffset: { width: 0, height: 2 },
              textShadowRadius: 8,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 14,
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              lineHeight: 21,
              color: "rgba(255,255,255,0.82)",
              textAlign: "center",
            }}
          >
            {subcopy}
          </Text>
        </Animated.View>

        <Pressable
          accessibilityLabel={ctaLabel}
          disabled={loadingTarget}
          onPress={step === "intro" ? () => void handleIntroContinue() : handleStartStory}
          style={{
            marginTop: 24,
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            alignItems: "center",
            justifyContent: "center",
            opacity: loadingTarget ? 0.7 : 1,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 6,
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#1A1A1A",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {ctaLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
