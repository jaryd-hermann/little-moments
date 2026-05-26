import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { applyThemeFromProfile } from "@/lib/themeSync";

const WELCOME_HERO = require("@/assets/images/2.png");

export default function OnboardingWelcomeScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    posthog.capture(
      "viewed_onboarding_welcome",
      onboardingEventProps(2, { screen: "post_auth_welcome" })
    );
  }, [posthog]);

  const handleContinue = useCallback(async () => {
    if (!user?.id || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture(
      "onboarding_welcome_continue",
      onboardingEventProps(2, { screen: "post_auth_welcome" })
    );
    setBusy(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "photo_permission" })
        .eq("id", user.id);
      if (error) {
        console.error("[OnboardingWelcome] profile update failed:", error);
        Alert.alert(
          "Couldn't continue",
          "Check your connection and try again."
        );
        return;
      }
      const { data: fresh } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (fresh) {
        const p = fresh as Profile;
        setProfile(p);
        applyThemeFromProfile(p.color_theme, p);
      }
      router.replace("/(auth)/photo-permission");
    } finally {
      setBusy(false);
    }
  }, [user?.id, busy, posthog, setProfile]);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      router.replace("/(auth)/sign-in");
    }
  }, [user?.id, isLoading]);

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
          onPress={() => void handleContinue()}
          disabled={busy || !user}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: "#000000",
            alignItems: "center",
            justifyContent: "center",
            opacity: busy || !user ? 0.55 : 1,
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 5 },
            shadowOpacity: 1,
            shadowRadius: 0,
            elevation: 6,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#1A1A1A" />
          ) : (
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
          )}
        </Pressable>
      </View>
    </View>
  );
}
