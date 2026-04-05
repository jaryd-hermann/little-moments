import { useState, useEffect } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { CauseGrid } from "@/components/donation/CauseGrid";
import { AboutCauseModal } from "@/components/donation/AboutCauseModal";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { DonationCause } from "@/constants/donationCauses";

const CTA_LAVENDER = "#f0d7ff";

export default function CauseScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const [causes, setCauses] = useState<DonationCause[]>([]);
  const [selectedCause, setSelectedCause] = useState<DonationCause | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    posthog.capture("paywall_cause_viewed");
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("donation_causes")
        .select("*")
        .order("sort_order");
      if (data) {
        const parsed = data as DonationCause[];
        setCauses(parsed);
        const mentalHealth = parsed.find((c) => c.image_key === "mental-health");
        if (mentalHealth && !selectedCause) setSelectedCause(mentalHealth);
      }
      setLoading(false);
    })();
  }, []);

  const handleContinue = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("paywall_cause_continue_tapped", {
      cause_title: selectedCause?.title ?? null,
    });
    setSaving(true);

    if (selectedCause && user) {
      await supabase.rpc("record_donation_cause", {
        p_cause_id: selectedCause.id,
      });
    }

    setSaving(false);
    router.push("/paywall");
  };

  const handleLearnMore = () => {
    if (selectedCause) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      posthog.capture("paywall_cause_learn_more_tapped", {
        cause_title: selectedCause.title,
      });
      setShowAbout(true);
    }
  };

  const handleCauseSelect = (cause: DonationCause) => {
    setSelectedCause(cause);
    posthog.capture("paywall_cause_selected", { cause_title: cause.title });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Pressable
        onPress={() => {
          posthog.capture("paywall_dismissed", { step: "cause" });
          router.dismiss(2);
        }}
        style={{ position: "absolute", right: 16, top: 16, zIndex: 10 }}
        hitSlop={8}
      >
        <Ionicons name="close" size={24} color={colors.textMuted} />
      </Pressable>

      <View style={{ flex: 1, paddingTop: 16 }}>
        <View style={{ paddingHorizontal: 24 }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 24,
              color: colors.text,
              textAlign: "center",
              lineHeight: 32,
            }}
          >
            Choose a cause
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 15,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 10,
              lineHeight: 22,
            }}
          >
            5% of your membership supports a cause you care about.
          </Text>
        </View>

        <View style={{ flex: 1, marginTop: 24 }}>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
          ) : (
            <CauseGrid
              causes={causes}
              selectedId={selectedCause?.id ?? null}
              onSelect={handleCauseSelect}
            />
          )}
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 16),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Pressable
            onPress={handleLearnMore}
            disabled={!selectedCause}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 9999,
              borderWidth: 1.5,
              borderColor: selectedCause ? CTA_LAVENDER : colors.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: selectedCause ? 1 : 0.4,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: selectedCause ? CTA_LAVENDER : colors.textMuted,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Learn More
            </Text>
          </Pressable>

          <Pressable
            onPress={handleContinue}
            disabled={saving}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 9999,
              backgroundColor: selectedCause
                ? CTA_LAVENDER
                : "rgba(255,255,255,0.15)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {saving ? (
              <ActivityIndicator color="#1A1A1A" />
            ) : (
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  fontSize: 14,
                  color: selectedCause ? "#1A1A1A" : colors.textMuted,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Continue
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      <AboutCauseModal
        visible={showAbout}
        cause={selectedCause}
        onClose={() => setShowAbout(false)}
      />
    </SafeAreaView>
  );
}
