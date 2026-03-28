import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSubscription } from "@/hooks/useSubscription";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { Colors } from "@/constants/Colors";
import { supabase } from "@/lib/supabase";
import type { PurchasesPackage } from "react-native-purchases";

let RevenueCatUI: any = null;
try {
  const mod = require("react-native-purchases-ui");
  const ui = mod?.default ?? mod;
  if (ui?.Paywall && typeof ui.Paywall === "function") {
    RevenueCatUI = ui;
  }
} catch {
  // Native module not available
}

type PlanType = "monthly" | "annual" | "lifetime";

type ThemePalette = (typeof Colors)["light"];

const FEATURES = [
  "Unlimited moments, forever",
  "AI Dig Deeper on every entry",
  "Cinematic 3D timeline",
  "Memory Jog races",
  "Full camera roll Rewind",
];

export default function PaywallScreen() {
  const {
    isTrialExpired,
    handleRestore,
    handlePurchase,
    monthlyPackage,
    annualPackage,
    lifetimePackage,
    isLoadingOfferings,
    loadOfferings,
  } = useSubscription();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const { colors, theme } = useTheme();

  const [selectedPlan, setSelectedPlan] = useState<PlanType>("annual");
  const [isLoading, setIsLoading] = useState(false);
  const [useNativePaywall, setUseNativePaywall] = useState(!!RevenueCatUI);

  const canDismiss = !isTrialExpired;

  useEffect(() => {
    loadOfferings();
  }, []);

  if (useNativePaywall && RevenueCatUI) {
    try {
      const Paywall = RevenueCatUI.Paywall;
      if (!Paywall) throw new Error("Paywall not available");
      return (
        <Paywall
          onDismiss={() => router.back()}
          onPurchaseCompleted={async () => {
            if (user && profile) {
              await supabase
                .from("profiles")
                .update({ subscription_status: "active" })
                .eq("id", user.id);
              setProfile({ ...profile, subscription_status: "active" });
            }
            router.back();
          }}
          onRestoreCompleted={async () => {
            if (user && profile) {
              await supabase
                .from("profiles")
                .update({ subscription_status: "active" })
                .eq("id", user.id);
              setProfile({ ...profile, subscription_status: "active" });
            }
            router.back();
          }}
          onPurchaseError={() => {
            setUseNativePaywall(false);
          }}
        />
      );
    } catch {
      setUseNativePaywall(false);
    }
  }

  // Manual fallback paywall
  const selectedPackage: PurchasesPackage | null =
    selectedPlan === "monthly"
      ? monthlyPackage
      : selectedPlan === "annual"
        ? annualPackage
        : lifetimePackage;

  const handleSubscribe = async () => {
    if (!selectedPackage) {
      Alert.alert("Error", "Subscription plan not available.");
      return;
    }

    setIsLoading(true);
    try {
      const result = await handlePurchase(selectedPackage);
      if (result.success) {
        router.back();
      } else if (!result.cancelled) {
        Alert.alert("Error", "Purchase failed. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Purchase failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestorePress = async () => {
    setIsLoading(true);
    const restored = await handleRestore();
    setIsLoading(false);
    if (restored) {
      Alert.alert("Restored!", "Your subscription has been restored.");
      router.back();
    } else {
      Alert.alert(
        "No Subscription Found",
        "We couldn't find an active subscription."
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      {canDismiss && (
        <Pressable
          onPress={() => router.back()}
          style={{
            position: "absolute",
            right: 16,
            top: 56,
            zIndex: 10,
          }}
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      )}

      <View className="flex-1 px-6 pt-16">
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: colors.text,
            textAlign: "center",
          }}
        >
          Unlock Little Moments
        </Text>

        <View style={{ marginTop: 32, gap: 16 }}>
          {FEATURES.map((feature) => (
            <View
              key={feature}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={colors.primary}
              />
              <Text
                style={{
                  fontFamily: "Roboto-Regular",
                  fontSize: 15,
                  color: colors.textSecondary,
                }}
              >
                {feature}
              </Text>
            </View>
          ))}
        </View>

        {isLoadingOfferings ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
        ) : (
          <View style={{ marginTop: 32, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PlanOption
                colors={colors}
                label="Monthly"
                price={monthlyPackage?.product.priceString ?? "$9.99/mo"}
                selected={selectedPlan === "monthly"}
                onSelect={() => setSelectedPlan("monthly")}
              />
              <PlanOption
                colors={colors}
                label="Annual"
                price={annualPackage?.product.priceString ?? "$79.99/yr"}
                sublabel={
                  annualPackage
                    ? `~$${(annualPackage.product.price / 12).toFixed(2)}/mo`
                    : "~$6.67/mo"
                }
                badge="BEST VALUE"
                selected={selectedPlan === "annual"}
                onSelect={() => setSelectedPlan("annual")}
              />
            </View>
            {lifetimePackage && (
              <PlanOption
                colors={colors}
                label="Lifetime"
                price={lifetimePackage.product.priceString}
                sublabel="One-time purchase · Forever yours"
                selected={selectedPlan === "lifetime"}
                onSelect={() => setSelectedPlan("lifetime")}
              />
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={handleSubscribe}
          disabled={isLoading || !selectedPackage}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor:
              theme === "dark" ? "#FFFFFF" : "#1A1A1A",
            alignItems: "center",
            justifyContent: "center",
            opacity: isLoading || !selectedPackage ? 0.6 : 1,
          }}
        >
          {isLoading ? (
            <ActivityIndicator
              color={theme === "dark" ? "#000000" : "#FFFFFF"}
            />
          ) : (
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: theme === "dark" ? "#000000" : "#FFFFFF",
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              SUBSCRIBE
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleRestorePress}
          style={{ marginTop: 16 }}
          disabled={isLoading}
        >
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 13,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            Restore Purchases
          </Text>
        </Pressable>

        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            textAlign: "center",
            marginTop: 16,
            lineHeight: 16,
          }}
        >
          Recurring billing. Cancel anytime.{"\n"}
          Terms · Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

function PlanOption({
  colors,
  label,
  price,
  sublabel,
  badge,
  selected,
  onSelect,
}: {
  colors: ThemePalette;
  label: string;
  price: string;
  sublabel?: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={{
        flex: 1,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected
          ? colors.primaryLight + "14"
          : colors.surface,
        padding: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textMuted,
          }}
        >
          {label}
        </Text>
        {badge && (
          <View
            style={{
              borderRadius: 9999,
              backgroundColor: colors.primary,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 10,
                color: "#000000",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 20,
          color: colors.text,
          marginTop: 4,
        }}
      >
        {price}
      </Text>
      {sublabel && (
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          {sublabel}
        </Text>
      )}
    </Pressable>
  );
}
