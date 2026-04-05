import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { TrialTimeline } from "@/components/onboarding/TrialTimeline";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useTheme } from "@/hooks/useTheme";
import type { PurchasesPackage } from "react-native-purchases";

type PlanKey = "annual" | "monthly" | "lifetime";

export default function TrialScreen() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [causeName, setCauseName] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.donation_cause_id) return;
    (async () => {
      const { data } = await supabase
        .from("donation_causes")
        .select("title, org_name")
        .eq("id", profile.donation_cause_id!)
        .single();
      if (data) {
        setCauseName(data.title);
        setOrgName(data.org_name);
      }
    })();
  }, [profile?.donation_cause_id]);
  const {
    monthlyPackage,
    annualPackage,
    lifetimePackage,
    isLoadingOfferings,
    handlePurchase,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("annual");
  const [isPurchasing, setIsPurchasing] = useState(false);

  const packageForPlan: Record<PlanKey, PurchasesPackage | null> = {
    annual: annualPackage,
    monthly: monthlyPackage,
    lifetime: lifetimePackage,
  };

  const annualMonthly = annualPackage
    ? `Only $${(annualPackage.product.price / 12).toFixed(2)}/mo`
    : "Only $6.66/mo";

  const annualSavings = (() => {
    if (!monthlyPackage || !annualPackage) return "19% OFF";
    const monthlyTotal = monthlyPackage.product.price * 12;
    const pct = Math.round(
      ((monthlyTotal - annualPackage.product.price) / monthlyTotal) * 100
    );
    return `${pct}% OFF`;
  })();

  const handleContinue = async () => {
    const pkg = packageForPlan[selectedPlan];
    if (!pkg) return;

    setIsPurchasing(true);
    try {
      const result = await handlePurchase(pkg);
      if (result.success) {
        await advanceOnboarding();
      } else if (result.cancelled) {
        // User dismissed the payment sheet
      }
    } catch {
      Alert.alert("Something went wrong", "Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const advanceOnboarding = async () => {
    if (!user) {
      router.replace("/(auth)/notifications-prompt");
      return;
    }
    await supabase
      .from("profiles")
      .update({ onboarding_phase: "notifications" })
      .eq("id", user.id);
    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) setProfile(fresh);
    router.replace("/(auth)/notifications-prompt");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="flex-1 px-6 pt-12">
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Start your 14-day trial
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 8,
            paddingHorizontal: 8,
          }}
        >
          {causeName
            ? `Build a proven life-changing daily ritual, and support ${causeName.toLowerCase()} every month`
            : "Build a proven life-changing daily ritual"}
        </Text>

        <View style={{ marginTop: 40 }}>
          <TrialTimeline causeName={causeName} />
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        {isLoadingOfferings ? (
          <ActivityIndicator color={colors.primary} style={{ marginBottom: 24 }} />
        ) : (
          <View style={{ gap: 10, marginBottom: 20 }}>
            <PlanOption
              label="Year"
              price={annualPackage?.product.priceString ?? "$79.99/yr"}
              sublabel={annualMonthly}
              badge={annualSavings}
              selected={selectedPlan === "annual"}
              onSelect={() => setSelectedPlan("annual")}
            />
            <PlanOption
              label="Month"
              price={monthlyPackage?.product.priceString ?? "$9.99/mo"}
              selected={selectedPlan === "monthly"}
              onSelect={() => setSelectedPlan("monthly")}
            />
            {lifetimePackage && (
              <PlanOption
                label="Lifetime"
                price={lifetimePackage.product.priceString}
                selected={selectedPlan === "lifetime"}
                onSelect={() => setSelectedPlan("lifetime")}
              />
            )}
          </View>
        )}

        <Pressable
          onPress={handleContinue}
          disabled={isPurchasing || isLoadingOfferings}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            alignItems: "center",
            justifyContent: "center",
            opacity: isPurchasing ? 0.6 : 1,
          }}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: "#000000",
                letterSpacing: 0.8,
              }}
            >
              Continue
            </Text>
          )}
        </Pressable>

        {orgName && (
          <Text
            style={{
              fontFamily: "Roboto-Bold",
              fontSize: 12,
              color: colors.text,
              textAlign: "center",
              marginTop: 10,
            }}
          >
            We'll send 5% to {orgName}
          </Text>
        )}

        <Pressable
          onPress={async () => {
            await advanceOnboarding();
          }}
          style={{ marginTop: 16 }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            {"I'll decide later"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function PlanOption({
  label,
  price,
  sublabel,
  badge,
  selected,
  onSelect,
}: {
  label: string;
  price: string;
  sublabel?: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable onPress={onSelect}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: colors.surface,
          paddingVertical: 16,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        {/* Radio circle */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: selected ? colors.primary : colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          {selected && (
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: colors.primary,
              }}
            />
          )}
        </View>

        {/* Label + sublabel */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 16,
              color: colors.text,
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontFamily: "Roboto-Light",
                fontSize: 13,
                color: colors.textSecondary,
                marginTop: 2,
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>

        {/* Price */}
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 16,
            color: colors.text,
          }}
        >
          {price}
        </Text>

        {/* Badge */}
        {badge && (
          <View
            style={{
              position: "absolute",
              top: -11,
              right: 12,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                color: "#000000",
                letterSpacing: 0.5,
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
