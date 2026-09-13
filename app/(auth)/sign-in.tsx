import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";
import { ReviewCarousel } from "@/components/auth/ReviewCarousel";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import { routeAfterAuth, healProfileIfStuckAfterCapture } from "@/lib/onboardingRoute";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { applyStreaksEnabledFromProfile } from "@/lib/streakSettingsSync";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";
import {
  clearLoginFromPreQuizWelcomeIntent,
  getLoginFromPreQuizWelcomeIntent,
} from "@/lib/onboardingLoginIntent";

const WORDMARK_LIGHT_ON_DARK = require("@/assets/images/wordmark-little-moments.png");
const WORDMARK_DARK_ON_LIGHT = require("@/assets/images/wordmark-little-moments-black.png");

export default function SignInScreen() {
  /**
   * Set only by the Login tap on the splash screen. Someone who came that way is
   * a returning user, so the reviews — which are here to convince — would just be
   * in the way of the buttons they came for.
   */
  const { intent } = useLocalSearchParams<{ intent?: string }>();
  const showReviews = intent !== "login";
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [error, setError] = useState("");
  const setProfile = useAuthStore((s) => s.setProfile);
  const setUser = useAuthStore((s) => s.setUser);
  const setSession = useAuthStore((s) => s.setSession);
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const signUpMethodRef = useRef<"apple" | "google" | "email">("email");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    posthog.capture("viewed_sign_in", onboardingEventProps(2));
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!showEmailForm) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 250);
    return () => clearTimeout(t);
  }, [showEmailForm]);

  const handleAuthSuccess = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const user = session?.user;
    if (!session || !user) {
      setError("Could not establish a session. Try again.");
      return;
    }
    setSession(session);
    setUser(user);

    let profile: Profile | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        profile = data as Profile;
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    let healed = healProfileIfStuckAfterCapture(profile);
    setProfile(healed);
    if (healed) {
      applyNotificationTimeFromProfile(healed.notification_time);
      applyThemeFromProfile(healed.color_theme, healed);
      applyStreaksEnabledFromProfile(healed);
    }

    if (
      healed?.created_at &&
      Date.now() - new Date(healed.created_at).getTime() < 60_000
    ) {
      posthog.capture(
        "created_account",
        onboardingEventProps(2, { method: signUpMethodRef.current })
      );
    }

    // Flush the pre-auth quiz answers onto the profile so downstream
    // screens (notifications-prompt pre-fill, paywall value-anchor mirror)
    // can read them via `profile.quiz_answers`. Best-effort — if it fails
    // the lazy retry in app/index.tsx picks it up on next app open.
    const quizState = useOnboardingQuizStore.getState();
    const localAnswerCount = Object.keys(quizState.answers).length;
    const profileAnswerCount = Object.keys(healed?.quiz_answers ?? {}).length;
    // Stale intent: user tapped Login on pre-quiz welcome then went back and completed the quiz.
    if (localAnswerCount > 0) {
      await clearLoginFromPreQuizWelcomeIntent();
    }
    if (localAnswerCount > 0 && profileAnswerCount === 0) {
      const flush = await quizState.flushToProfile(user.id);
      if (flush.ok) {
        posthog.capture(
          "quiz_flushed_to_profile",
          onboardingEventProps(0, { answer_count: flush.answerCount })
        );
        const { data: refreshed } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (refreshed) {
          healed = refreshed as Profile;
          setProfile(healed);
        }
      }
    } else {
      const loginFromPreQuizWelcome = await getLoginFromPreQuizWelcomeIntent();
      if (
        loginFromPreQuizWelcome &&
        localAnswerCount === 0 &&
        profileAnswerCount === 0
      ) {
        const flush = await quizState.flushSkipQuizDefaultsToProfile(user.id);
        if (flush.ok) {
          posthog.capture(
            "skip_quiz_defaults_flushed_to_profile",
            onboardingEventProps(0, { source: "pre_quiz_login" })
          );
          await clearLoginFromPreQuizWelcomeIntent();
          const { data: refreshed } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
          if (refreshed) {
            healed = refreshed as Profile;
            setProfile(healed);
          }
        }
      } else if (loginFromPreQuizWelcome) {
        await clearLoginFromPreQuizWelcomeIntent();
      }
    }

    routeAfterAuth(healed);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingBottom: 32,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
          }}
        >
        <View
          style={{
            alignItems: "center",
            marginTop: 16,
            width: "100%",
            /*
              With no reviews under it the wordmark sat alone at the top with the
              whole void between it and the buttons. Growing and bottom-aligning
              it splits that space in two, so it reads as centred and the gap
              below is half what it was.
            */
            ...(showReviews
              ? null
              : { flex: 1, justifyContent: "flex-end" as const }),
          }}
        >
          <Image
            source={
              theme === "dark" ? WORDMARK_LIGHT_ON_DARK : WORDMARK_DARK_ON_LIGHT
            }
            style={{ width: 220, height: 52 }}
            resizeMode="contain"
            accessibilityLabel="Little Moments"
          />
          <Text
            style={{
              marginTop: 24,
              textAlign: "center",
              fontFamily: "Roboto-Regular",
              fontSize: 17,
              lineHeight: 26,
              color: colors.text,
              paddingHorizontal: 8,
            }}
          >
            Sign in and we&apos;ll help you capture your first moment in under
            60s
          </Text>
        </View>

        {showReviews ? (
          <View style={{ marginTop: 24 }}>
            <ReviewCarousel />
          </View>
        ) : null}

        {error ? (
          <Text className="mt-4 text-sm text-red-500">
            {error}
          </Text>
        ) : null}

        <View
          style={{
            flex: 1,
            // Bottom of the space rather than the middle of it: the reviews above
            // are what this screen is asking them to read, and the auth buttons
            // sit within thumb reach.
            justifyContent: "flex-end",
            paddingTop: 32,
            paddingBottom: 12,
          }}
        >
          <View
            style={{
              gap: 16,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <AppleSignInButton
              onSuccess={() => {
                signUpMethodRef.current = "apple";
                handleAuthSuccess();
              }}
              onError={setError}
            />

            <GoogleSignInButton
              onSuccess={() => {
                signUpMethodRef.current = "google";
                handleAuthSuccess();
              }}
              onError={setError}
            />

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowEmailForm(!showEmailForm);
              }}
              style={{
                height: 52,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: colors.text,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                }}
              >
                CONTINUE WITH EMAIL
              </Text>
            </Pressable>
          </View>
        </View>

        {showEmailForm && (
          <EmailAuthForm
            onSuccess={() => {
              signUpMethodRef.current = "email";
              handleAuthSuccess();
            }}
          />
        )}

        <View className="mt-auto pt-8">
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            By continuing, I confirm that I am 13 or older and agree to the{" "}
            <Text
              style={{ textDecorationLine: "underline" }}
              onPress={() =>
                Linking.openURL("https://getlittlemoments.com/terms")
              }
            >
              Terms
            </Text>
            {" "}and{" "}
            <Text
              style={{ textDecorationLine: "underline" }}
              onPress={() =>
                Linking.openURL("https://getlittlemoments.com/privacy")
              }
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
