import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { usePostHog } from "posthog-react-native";

const BG = "#000000";
const INK = "#FFFFFF";
const CTA_LAVENDER = "#f0d7ff";

interface PersonalizedCopy {
  letter: string;
}

function getCopyForTags(tags: string[]): PersonalizedCopy {
  const set = new Set(tags);

  if (set.has("family") || set.has("legacy")) {
    return {
      letter:
        "You want the people who matter to know who you really are — not the highlight reel, but the real moments. The Tuesday nights, the little things your family said, the details that make your story yours.\n\nThat's exactly what Little Moments is for.\n\nEvery day, you'll get a simple starting point — a word, a photo, or a question. You speak or type for two minutes, and Ellie, your memory guide, helps you capture the moment.\n\nOver time, these moments become chapters. A real record of your life, written in your words.",
    };
  }

  if (set.has("time") || set.has("memory") || set.has("self")) {
    return {
      letter:
        "You've noticed it — days blurring together, weeks disappearing before you've had a chance to hold onto them. You're not losing your memory. You're just not catching the moments before they slip away.\n\nThat's what Little Moments changes.\n\nEvery day, you'll get a simple starting point — a word, a photo, or a question. Two minutes is all it takes. Ellie, your memory guide, will help you pull out the details that matter.\n\nThe more moments you capture, the more connections we find. And once a month, we turn it all into a chapter of your life.",
    };
  }

  if (set.has("presence")) {
    return {
      letter:
        "You're living your life — but sometimes it feels like you're watching it go by on autopilot. Not because nothing's happening, but because you're not stopping to notice.\n\nLittle Moments gives you that pause.\n\nEvery day, you'll get a simple starting point — a word, a photo, or a question. Two minutes of real reflection. Ellie, your memory guide, will help you notice what you might have missed.\n\nIt's not a journal. It's a daily habit that makes you more present to your own life.",
    };
  }

  // Default: habit
  return {
    letter:
      "You've tried journaling before. Blank pages, guilt when you miss a day, apps that ask too much. We get it.\n\nLittle Moments is different.\n\nEvery day, you get a starting point — a word, a photo from your camera roll, or a simple question. You speak or type for two minutes. That's it. Ellie, your memory guide, handles the rest.\n\nNo blank pages. No pressure. Just a tiny daily habit that quietly captures the moments that make your life yours.",
  };
}

export default function PersonalizedScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    posthog.capture("viewed_personalized");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        router.replace("/(auth)/sign-in");
        return;
      }

      const optionIds = profile?.resonance_option_ids ?? [];
      if (optionIds.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("purpose_options")
        .select("tag")
        .in("id", optionIds);

      if (!cancelled) {
        setTags(data?.map((r) => r.tag) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile?.resonance_option_ids]);

  const copy = getCopyForTags(tags);

  const onContinue = async () => {
    if (!user) return;
    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    await supabase
      .from("profiles")
      .update({ onboarding_phase: "activation" })
      .eq("id", user.id);

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh as Profile);

    router.replace("/(auth)/activation");
    setSaving(false);
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
    <SafeAreaView
      style={{ flex: 1, backgroundColor: BG }}
      edges={["top", "left", "right"]}
    >
      <View style={{ flex: 1 }}>
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
            paddingTop: 36,
            paddingBottom: 120,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 17,
              lineHeight: 28,
              color: "rgba(255,255,255,0.85)",
            }}
          >
            {copy.letter}
          </Text>

          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 24,
              color: "rgba(255,255,255,0.6)",
              marginTop: 28,
              fontStyle: "italic",
            }}
          >
            Ellie will be your guide — she'll help you find the story in the
            moment.
          </Text>
        </ScrollView>

        <View
          style={{
            backgroundColor: BG,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 16),
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Pressable
            onPress={onContinue}
            disabled={saving}
            style={{
              height: 52,
              borderRadius: 9999,
              backgroundColor: saving ? "rgba(255,255,255,0.25)" : CTA_LAVENDER,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {saving ? (
              <ActivityIndicator color={BG} />
            ) : (
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 15,
                  color: BG,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Let's start
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
