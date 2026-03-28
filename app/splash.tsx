import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";
import { BouncingLogo } from "@/components/splash/BouncingLogo";
import { SPLASH_TAGLINES } from "@/constants/taglines";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

export default function SplashScreen() {
  const { colors } = useTheme();
  const [taglineIndex, setTaglineIndex] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase
          .from("profiles")
          .select("onboarding_completed")
          .eq("id", session.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile?.onboarding_completed) {
              router.replace("/(tabs)/today");
            } else {
              router.replace("/(auth)/onboarding");
            }
          });
      }
    });
  }, []);

  const handleCornerHit = () => {
    setTaglineIndex(
      (prev) => (prev + 1) % SPLASH_TAGLINES.length
    );
  };

  return (
    <View className="flex-1 bg-black">
      <BouncingLogo onCornerHit={handleCornerHit} />

      <View className="flex-1 items-center justify-center">
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 42,
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 52,
          }}
        >
          Little{"\n"}Moments
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: "rgba(255, 255, 255, 0.4)",
            marginTop: 16,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          HONOR THE EVERYDAY
        </Text>
      </View>

      <Pressable
        onPress={() => router.replace("/(auth)/sign-in")}
        style={{
          marginHorizontal: 24,
          marginBottom: 48,
          height: 52,
          borderRadius: 9999,
          backgroundColor: colors.primary,
          borderWidth: 2,
          borderColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
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
          GET STARTED
        </Text>
      </Pressable>
    </View>
  );
}
