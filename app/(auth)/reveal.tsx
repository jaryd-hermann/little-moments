import { useEffect, useMemo, useRef } from "react";
import { View, Text, Pressable, StatusBar } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { CapsuleFlipbookView } from "@/components/memories/CapsuleFlipbookView";
import { useEntries } from "@/hooks/useEntries";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import type { Entry } from "@/store/entryStore";

export default function RevealScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const { entries } = useEntries();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const params = useLocalSearchParams<{ entryId?: string }>();
  const mountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    posthog.capture("viewed_reveal_flipbook", onboardingEventProps(5));
  }, []);

  /**
   * Restrict the flipbook to the just-saved entry. Falls back to the most
   * recent moment if the param is missing — the user only has one moment at
   * this point of onboarding so it's still the right card.
   */
  const flipbookEntries: Entry[] = useMemo(() => {
    const moments = entries.filter((e) => e.entry_type === "moment");
    if (params.entryId) {
      const found = moments.find((e) => e.id === params.entryId);
      if (found) return [found];
    }
    if (moments.length === 0) return [];
    const sorted = [...moments].sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
    );
    return [sorted[0]];
  }, [entries, params.entryId]);

  const handleContinue = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture(
      "reveal_continued",
      onboardingEventProps(5, {
        ms_on_screen: Date.now() - mountedAtRef.current,
      })
    );
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "notifications" })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    }
    router.replace("/(auth)/notifications-prompt");
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 2,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontFamily: "PMGothicLudington-Text110",
            fontSize: 26,
            color: colors.text,
          }}
        >
          Your first moment is saved!
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            marginTop: 10,
          }}
        >
          Keep going — these capsules can become a beautiful printed journal of
          your year.
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <CapsuleFlipbookView
          entries={flipbookEntries}
          disableEndOfFeedRoute
        />
      </View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: 28,
          backgroundColor: colors.background,
        }}
      >
        <Pressable
          accessibilityLabel="Continue"
          onPress={handleContinue}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
            ...bevelShadow(theme),
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: PINK_CTA_INK,
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
