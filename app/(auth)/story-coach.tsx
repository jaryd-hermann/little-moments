import { useState } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { StoryCoachToggle } from "@/components/story-coach/StoryCoachToggle";

export default function StoryCoachOnboardingScreen() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const posthog = usePostHog();
  const [saving, setSaving] = useState(false);

  const wantsStorytelling =
    profile?.follow_up_screen_key === "storytelling" ||
    profile?.follow_up_screen_key === "time_storytelling";

  const personalizedNote = wantsStorytelling
    ? "You said you wanted to improve your storytelling — Ellie can help with that."
    : null;

  const handleSelect = async (enabled: boolean) => {
    if (!user) return;
    setSaving(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    posthog.capture(enabled ? "enabled_story_coach" : "disabled_story_coach", {
      source: "onboarding",
    });

    await supabase
      .from("profiles")
      .update({
        story_coach_enabled: enabled,
        onboarding_completed: true,
        onboarding_phase: "done",
      })
      .eq("id", user.id);

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh as Profile);

    router.replace("/(tabs)/today");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <StoryCoachToggle
        defaultEnabled={true}
        personalizedNote={personalizedNote}
        onSelect={handleSelect}
        ctaLabel="Next"
        ctaLoading={saving}
      />
    </SafeAreaView>
  );
}
