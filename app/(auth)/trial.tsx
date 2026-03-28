import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { TrialTimeline } from "@/components/onboarding/TrialTimeline";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useTheme } from "@/hooks/useTheme";

export default function TrialScreen() {
  const { colors, theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const profile = useAuthStore((s) => s.profile);

  const {
    monthlyPackage,
    annualPackage,
    lifetimePackage,
    isLoadingOfferings,
  } = useSubscription();

  const handleStartTrial = async () => {
    if (!user) return;

    await supabase
      .from("profiles")
      .update({
        trial_start_date: new Date().toISOString(),
        subscription_status: "trial",
        onboarding_completed: true,
      })
      .eq("id", user.id);

    if (profile) {
      setProfile({
        ...profile,
        trial_start_date: new Date().toISOString(),
        subscription_status: "trial",
        onboarding_completed: true,
      });
    }

    router.replace("/(tabs)/today");
  };

  const formatPrice = (priceStr: string) => priceStr;

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
          Start Your Free Trial
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          14 days free · No credit card required
        </Text>

        <View style={{ marginTop: 40 }}>
          <TrialTimeline />
        </View>

        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 11,
            color: colors.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
            marginTop: 32,
            marginBottom: 12,
          }}
        >
          PLANS AFTER TRIAL
        </Text>

        {isLoadingOfferings ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
        ) : (
          <View style={{ gap: 10 }}>
            {/* Row: Monthly + Annual */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PlanCard
                label="Monthly"
                price={monthlyPackage?.product.priceString ?? "$9.99/mo"}
                sublabel={null}
                style={{ flex: 1 }}
              />
              <PlanCard
                label="Annual"
                price={annualPackage?.product.priceString ?? "$79.99/yr"}
                sublabel={annualPackage ? `~${formatMonthly(annualPackage.product.price)}/mo` : "~$6.67/mo"}
                badge="BEST VALUE"
                style={{ flex: 1 }}
              />
            </View>

            {/* Lifetime */}
            {lifetimePackage && (
              <PlanCard
                label="Lifetime"
                price={lifetimePackage.product.priceString}
                sublabel="One-time purchase · Forever"
              />
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        <Pressable
          onPress={handleStartTrial}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: theme === "dark" ? "#FFFFFF" : "#1A1A1A",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: theme === "dark" ? "#000000" : "#FFFFFF",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            START FREE TRIAL
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/(tabs)/today")}
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
            I'll decide later
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function formatMonthly(annualPrice: number): string {
  const monthly = annualPrice / 12;
  return `$${monthly.toFixed(2)}`;
}

function PlanCard({
  label,
  price,
  sublabel,
  badge,
  style,
}: {
  label: string;
  price: string;
  sublabel?: string | null;
  badge?: string;
  style?: object;
}) {
  const { colors, theme } = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          padding: 16,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textSecondary,
          }}
        >
          {label}
        </Text>
        {badge && (
          <View
            style={{
              borderRadius: 9999,
              backgroundColor: colors.primary,
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 9,
                color: theme === "dark" ? "#000000" : "#1A1A1A",
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
          fontSize: 18,
          color: colors.textSecondary,
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
    </View>
  );
}
