import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { routeAfterAuth, healProfileIfStuckAfterCapture } from "@/lib/onboardingRoute";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";

export default function IndexRedirect() {
  const { colors } = useTheme();
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setProfile = useAuthStore((s) => s.setProfile);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace("/splash");
      return;
    }

    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      let p = healProfileIfStuckAfterCapture(profile as Profile | null);

      // Lazy quiz-flush retry: if the post-auth flush in sign-in.tsx
      // didn't land (offline / race), retry here on every cold start
      // until the profile has the answers.
      const quizState = useOnboardingQuizStore.getState();
      const localAnswerCount = Object.keys(quizState.answers).length;
      const profileAnswerCount = Object.keys(p?.quiz_answers ?? {}).length;
      if (localAnswerCount > 0 && profileAnswerCount === 0) {
        const flush = await quizState.flushToProfile(user.id);
        if (flush.ok) {
          const { data: refreshed } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();
          if (refreshed) {
            p = refreshed as Profile;
          }
        }
      }

      if (p) {
        setProfile(p);
        applyNotificationTimeFromProfile(p.notification_time);
        applyThemeFromProfile(p.color_theme, p);
      }
      routeAfterAuth(p);
    })();
  }, [user, isLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
