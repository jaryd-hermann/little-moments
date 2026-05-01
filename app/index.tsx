import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";
import { routeAfterAuth } from "@/lib/onboardingRoute";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";

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

    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data: profile }) => {
        const p = profile as Profile | null;
        if (p) {
          setProfile(p);
          applyNotificationTimeFromProfile(p.notification_time);
        }
        routeAfterAuth(p);
      });
  }, [user, isLoading]);

  return (
    <View className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
