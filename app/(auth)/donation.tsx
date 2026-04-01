import { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CauseGrid } from "@/components/donation/CauseGrid";
import { AboutCauseModal } from "@/components/donation/AboutCauseModal";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import type { DonationCause } from "@/constants/donationCauses";

export default function DonationScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [causes, setCauses] = useState<DonationCause[]>([]);
  const [selectedCause, setSelectedCause] = useState<DonationCause | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("donation_causes")
        .select("*")
        .order("sort_order");
      if (data?.length) {
        setCauses(data);
        setSelectedCause(data[0]);
      }
      setIsLoading(false);
    })();
  }, []);

  const handleContinue = async () => {
    if (!selectedCause) return;
    setIsSaving(true);
    try {
      if (user) {
        await supabase.rpc("record_donation_cause", {
          p_cause_id: selectedCause.id,
        });
        const { data: fresh } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (fresh) setProfile(fresh);
      }
      router.replace("/(auth)/trial");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!user) {
      router.replace("/(auth)/trial");
      return;
    }
    await supabase
      .from("profiles")
      .update({ onboarding_phase: "trial" })
      .eq("id", user.id);
    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh);
    router.replace("/(auth)/trial");
  };

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#000000",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />

      {/* Close button */}
      <Pressable
        onPress={handleSkip}
        hitSlop={12}
        style={{
          position: "absolute",
          top: insets.top + 8,
          right: 16,
          zIndex: 10,
          width: 36,
          height: 36,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
      </Pressable>

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 48,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 26,
            color: "#FFFFFF",
            textAlign: "center",
            paddingHorizontal: 32,
            lineHeight: 36,
          }}
        >
          Pick a cause
        </Text>

        {/* Subtitle */}
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 14,
            color: "rgba(255,255,255,0.55)",
            textAlign: "center",
            marginTop: 12,
            paddingHorizontal: 40,
            lineHeight: 20,
          }}
        >
          We donate{" "}
          <Text
            style={{
              fontFamily: "Roboto-Bold",
              color: "#FFA946",
            }}
          >
            5% of all subscription revenue
          </Text>{" "}
          monthly. Your choice helps give back.
        </Text>

        {/* Grid */}
        <View style={{ marginTop: 32 }}>
          <CauseGrid
            causes={causes}
            selectedId={selectedCause?.id ?? null}
            onSelect={setSelectedCause}
          />
        </View>
      </ScrollView>

      {/* Bottom bar */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          backgroundColor: "rgba(0,0,0,0.92)",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
            setShowAbout(true);
          }}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 9999,
            borderWidth: 1.5,
            borderColor: "rgba(255,255,255,0.2)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 14,
              color: "#FFFFFF",
              letterSpacing: 0.3,
            }}
          >
            About cause
          </Text>
        </Pressable>

        <Pressable
          onPress={handleContinue}
          disabled={isSaving || !selectedCause}
          style={{
            flex: 1,
            height: 48,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 14,
                color: "#000000",
                letterSpacing: 0.5,
              }}
            >
              Continue
            </Text>
          )}
        </Pressable>
      </View>

      <AboutCauseModal
        visible={showAbout}
        cause={selectedCause}
        onClose={() => setShowAbout(false)}
      />
    </View>
  );
}
