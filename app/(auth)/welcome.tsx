import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { onboardingEventProps } from "@/lib/onboardingEvents";

const WELCOME_HERO = require("@/assets/images/2.png");

/**
 * Pre-auth, pre-quiz welcome screen. Mirrors the splash.tsx full-bleed
 * pattern but with 2.png as the hero and continues into the quiz. Lives
 * in the auth group but doesn't require a session.
 *
 * NOTE: The legacy post-auth onboarding-welcome.tsx (also 2.png) stays
 * registered for users mid-onboarding when this shipped; new users won't
 * hit it because the quiz-flush writes onboarding_phase = "photo_permission".
 */
export default function PreQuizWelcomeScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    posthog.capture(
      "viewed_onboarding_welcome",
      onboardingEventProps(0, { screen: "pre_quiz_welcome" })
    );
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Image
        source={WELCOME_HERO}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={200}
      />

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
          accessibilityLabel="Continue"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            posthog.capture(
              "onboarding_welcome_continue",
              onboardingEventProps(0, { screen: "pre_quiz_welcome" })
            );
            router.replace("/(auth)/quiz/1");
          }}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            alignItems: "center",
            justifyContent: "center",
            // Splash/welcome use a hard black drop-shadow so the CTA pops
            // against the full-bleed hero photo. bevelShadow(theme) hides
            // in this context — matching splash.tsx instead.
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
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
