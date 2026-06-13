import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { VideoView, useVideoPlayer } from "expo-video";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { routeAfterAuth, healProfileIfStuckAfterCapture } from "@/lib/onboardingRoute";
import {
  ONBOARDING_QUIZ_FLAG_KEY,
  resolveOnboardingQuizVariant,
  shouldSkipOnboardingQuiz,
} from "@/lib/onboardingQuizFlag";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { usePostHog } from "posthog-react-native";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { setLoginFromPreQuizWelcomeIntent } from "@/lib/onboardingLoginIntent";

const SPLASH_HERO = require("@/assets/images/1.png");
const SPLASH_WORDMARK = require("@/assets/images/wordmark-little-moments.png");

// 1.png stays as a poster underneath so the first frame never flashes
// black while the player attaches. See assets/videos/README.md for the
// recommended ffmpeg encode (HEVC, no audio, ~150–500 KB).
const SPLASH_VIDEO = require("@/assets/videos/splash.mp4") as number;

/**
 * Pre-quiz onboarding narrative. The video loops in the background across
 * every step; only the headline copy + CTA copy change. Each step fires a
 * distinct PostHog tap event so the funnel is measurable, and the final
 * step replaces into the quiz (skipping the legacy `/(auth)/welcome` 2.png
 * screen — the splash now owns that role).
 *
 * `title` may be a string[] for multi-line layouts (step e: The Good /
 * The Bad / The "Boring".) where each line is its own <Text> so we can
 * style them on their own baseline. A line can also be `{ wordmark: ... }`
 * to render an image inline — used on step f to swap the "Little Moments"
 * type for the brand wordmark.
 */
type TitleLine = string | { wordmark: number; width: number; height: number };

type SplashStep = {
  id: "a" | "b" | "c" | "d" | "e" | "f";
  title: TitleLine | TitleLine[];
  subtitle?: string;
  cta: string;
};

const SPLASH_STEPS: SplashStep[] = [
  {
    id: "a",
    title: "Most people can't remember what happened last Tuesday.",
    subtitle:
      "(Life is made of little moments, but those are the ones that slip away.)",
    cta: "That's true...",
  },
  {
    id: "b",
    title: "We help you notice and keep them, with 1 photo moment a day.",
    subtitle: "(A <60s a day journal habit that actually sticks.)",
    cta: "Continue...",
  },
  {
    id: "c",
    title: ["No pressure.", "No blank pages.", "No big expectations."],
    subtitle:
      "(Just a quick in and out everyday that becomes a real keepsake of real life)",
    cta: "Continue",
  },
  {
    id: "d",
    title: "Just the moments you're already capturing.",
    subtitle:
      "(Pick one photo a day, use voice or text to capture a few words behind it.)",
    cta: "Continue",
  },
  {
    id: "e",
    title: ["The Good.", "The Bad.", 'The "Boring".'],
    subtitle:
      "(We'll take them all and turn them into chapters. Future you will thank you.)",
    cta: "Continue",
  },
  {
    id: "f",
    // Wordmark dimensions match the convention used in sign-in.tsx /
    // today.tsx / AppHeader.tsx (light-on-dark, ~220–240 × 52–56 with
    // contain) so the brand mark reads at a consistent size across the
    // app and against the dark gradient on this final step.
    title: ["Welcome to", { wordmark: SPLASH_WORDMARK, width: 240, height: 56 }],
    subtitle: "Capture a lifetime of memories, with 1 photo/video and just 60s a day.",
    cta: "Capture first moment",
  },
];

export default function SplashScreen() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);

  const step = SPLASH_STEPS[stepIndex];
  const isFinalStep = stepIndex === SPLASH_STEPS.length - 1;
  const titleLines = Array.isArray(step.title) ? step.title : [step.title];

  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    // Don't pause whatever the user is already listening to.
    p.audioMixingMode = "mixWithOthers";
    p.play();
  });

  useEffect(() => {
    posthog.capture("viewed_splash", onboardingEventProps(1));
  }, []);

  // Per-step view event so the funnel reveals where users drop off
  // inside the splash narrative, not just at the splash boundary.
  useEffect(() => {
    posthog.capture(
      "splash_step_viewed",
      onboardingEventProps(1, { step: step.id, step_index_within_splash: stepIndex })
    );
  }, [stepIndex]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            const p = healProfileIfStuckAfterCapture(profile as Profile | null);
            if (p) {
              setProfile(p);
              applyNotificationTimeFromProfile(p.notification_time);
              applyThemeFromProfile(p.color_theme, p);
            }
            routeAfterAuth(p);
          });
      }
    });
  }, []);

  const handleAdvance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture(
      "splash_step_tapped",
      onboardingEventProps(1, {
        step: step.id,
        step_index_within_splash: stepIndex,
        cta: step.cta,
      })
    );
    if (isFinalStep) {
      posthog.capture("splash_get_started", onboardingEventProps(1));
      const variant = resolveOnboardingQuizVariant(
        posthog.getFeatureFlag(ONBOARDING_QUIZ_FLAG_KEY)
      );
      posthog.capture("onboarding_quiz_flag_exposure", {
        ...onboardingEventProps(1),
        flag: ONBOARDING_QUIZ_FLAG_KEY,
        variant,
      });
      if (shouldSkipOnboardingQuiz(posthog.getFeatureFlag(ONBOARDING_QUIZ_FLAG_KEY))) {
        router.replace("/(auth)/sign-in");
      } else {
        router.replace("/(auth)/quiz/1");
      }
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleLogin = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    posthog.capture(
      "splash_login_tapped",
      onboardingEventProps(1, { step: step.id, step_index_within_splash: stepIndex })
    );
    // Mirrors the welcome.tsx login intent so OAuth returns flush the
    // default quiz state on this user — same downstream behaviour as
    // the pre-quiz welcome login (which the splash is now replacing).
    void setLoginFromPreQuizWelcomeIntent();
    router.replace("/(auth)/sign-in");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      {/* Always render 1.png — it's instant and acts as the poster
          frame underneath the video so we never flash black on launch. */}
      <Image
        source={SPLASH_HERO}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
      />
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      {/* Bottom-darkening gradient keeps the white headline + CTA legible
          across arbitrary frames of the looping video without dimming the
          imagery up top. */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.55)"]}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Pressable
        accessibilityLabel="Already have an account? Log in"
        onPress={handleLogin}
        hitSlop={12}
        style={{
          position: "absolute",
          top: insets.top + 12,
          right: 16,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontFamily: "Roboto-Medium",
            fontSize: 15,
            textShadowColor: "rgba(0,0,0,0.5)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 4,
          }}
        >
          Login
        </Text>
      </Pressable>

      {/* Headline block — keyed on step.id so Reanimated re-runs the
          entering animation each time the user advances. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + 96,
          paddingHorizontal: 28,
        }}
        pointerEvents="none"
      >
        <Animated.View
          key={step.id}
          entering={FadeInDown.duration(450).delay(60)}
        >
          {titleLines.map((line, idx) =>
            typeof line === "string" ? (
              <Text
                key={idx}
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
                {line}
              </Text>
            ) : (
              <Image
                key={idx}
                source={line.wordmark}
                style={{
                  width: line.width,
                  height: line.height,
                  alignSelf: "center",
                  // Match the optical baseline of the surrounding 38px-line
                  // <Text>s above/below so the wordmark doesn't crash into
                  // the headline.
                  marginTop: 6,
                }}
                contentFit="contain"
                accessibilityLabel="Little Moments"
              />
            )
          )}
          {step.subtitle ? (
            <Text
              style={{
                marginTop: 14,
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                lineHeight: 21,
                color: "rgba(255,255,255,0.82)",
                textAlign: "center",
                textShadowColor: "rgba(0,0,0,0.5)",
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 6,
              }}
            >
              {step.subtitle}
            </Text>
          ) : null}
        </Animated.View>
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: insets.bottom + 8,
          paddingHorizontal: 24,
        }}
        pointerEvents="box-none"
      >
        <Pressable
          accessibilityLabel={step.cta}
          onPress={handleAdvance}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            alignItems: "center",
            justifyContent: "center",
            // Splash-only treatment: hard black drop-shadow reads against the
            // bright hero photo where the previous cream-tone shadow disappeared.
            // Other Continue/CTA styles across the app are left untouched.
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
            {step.cta}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
