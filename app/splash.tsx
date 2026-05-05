import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { routeAfterAuth } from "@/lib/onboardingRoute";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { usePostHog } from "posthog-react-native";
import { onboardingEventProps } from "@/lib/onboardingEvents";

const SPLASH_HERO = require("@/assets/images/1.png");

export default function SplashScreen() {
  const setProfile = useAuthStore((s) => s.setProfile);
  const { colors } = useTheme();
  const posthog = usePostHog();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    posthog.capture("viewed_splash", onboardingEventProps(1));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            const p = profile as Profile | null;
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

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />
      <Image
        source={SPLASH_HERO}
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
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            posthog.capture("splash_get_started", onboardingEventProps(1));
            router.replace("/(auth)/sign-in");
          }}
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
            Continue
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
