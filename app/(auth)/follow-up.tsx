import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import {
  getFollowUpCopy,
  type FollowUpScreenKey,
} from "@/lib/onboardingFollowUp";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";

const BG = "#000000";
const INK = "#FFFFFF";
const CTA_LAVENDER = "#f0d7ff";
const CREAM = "#FFFFEB";

export default function FollowUpScreen() {
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState<FollowUpScreenKey>("habit");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/(auth)/sign-in");
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("follow_up_screen_key")
        .eq("id", user.id)
        .single();

      if (!cancelled && data?.follow_up_screen_key) {
        setKey(data.follow_up_screen_key as FollowUpScreenKey);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const copy = getFollowUpCopy(key);

  const onContinue = async () => {
    if (!user) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
    await supabase
      .from("profiles")
      .update({ onboarding_phase: "slides" })
      .eq("id", user.id);

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh as Profile);

    router.replace("/(auth)/onboarding");
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator color={INK} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <View
          style={{
            flexDirection: "row",
            height: 3,
            borderRadius: 2,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.2)",
          }}
        >
          <View style={{ flex: 1, backgroundColor: INK }} />
          <View style={{ flex: 1, backgroundColor: INK }} />
          <View style={{ flex: 1, backgroundColor: "transparent" }} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 32,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 26,
            color: INK,
            textAlign: "center",
            lineHeight: 34,
          }}
        >
          {copy.heading}
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 16,
            lineHeight: 24,
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            marginTop: 16,
          }}
        >
          {copy.subtext}
        </Text>

        <View style={{ marginTop: 32, gap: 14 }}>
          {copy.checks.map((line, i) => (
            <View
              key={i}
              style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
            >
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={CREAM}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  lineHeight: 22,
                  color: CREAM,
                }}
              >
                {line.replace(/^✅\s*/, "")}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={onContinue}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: CTA_LAVENDER,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: BG,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Continue
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
