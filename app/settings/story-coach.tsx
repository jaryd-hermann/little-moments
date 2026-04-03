import { useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { StoryCoachToggle } from "@/components/story-coach/StoryCoachToggle";

export default function SettingsStoryCoachScreen() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const posthog = usePostHog();
  const [saving, setSaving] = useState(false);

  const handleSelect = async (enabled: boolean) => {
    if (!user) return;
    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    posthog.capture(enabled ? "enabled_story_coach" : "disabled_story_coach", {
      source: "settings",
    });

    await supabase
      .from("profiles")
      .update({ story_coach_enabled: enabled })
      .eq("id", user.id);

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh as Profile);

    setSaving(false);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="close" size={24} color="#000000" />
        </Pressable>
      </View>

      <StoryCoachToggle
        defaultEnabled={profile?.story_coach_enabled ?? false}
        onSelect={handleSelect}
        ctaLabel="Save"
        ctaLoading={saving}
      />
    </SafeAreaView>
  );
}
