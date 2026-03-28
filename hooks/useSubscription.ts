import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  checkEntitlementStatus,
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
} from "@/lib/revenuecat";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

export function useSubscription() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);

  const isTrialExpired = useCallback(() => {
    if (!profile) return false;
    if (profile.subscription_status === "active") return false;
    if (profile.subscription_status === "expired") return true;
    if (
      profile.subscription_status === "trial" &&
      profile.trial_start_date
    ) {
      const trialStart = new Date(profile.trial_start_date);
      const trialEnd = new Date(
        trialStart.getTime() + 14 * 24 * 60 * 60 * 1000
      );
      return new Date() > trialEnd;
    }
    return false;
  }, [profile]);

  const loadOfferings = useCallback(async () => {
    setIsLoadingOfferings(true);
    try {
      const current = await getCurrentOffering();
      setOffering(current);
    } catch {
      // Offerings not available
    } finally {
      setIsLoadingOfferings(false);
    }
  }, []);

  useEffect(() => {
    loadOfferings();
  }, [loadOfferings]);

  const syncSubscription = useCallback(async () => {
    if (!profile || !user) return;
    const status = await checkEntitlementStatus();
    if (status === "active" && profile.subscription_status !== "active") {
      await supabase
        .from("profiles")
        .update({ subscription_status: "active" })
        .eq("id", user.id);
      setProfile({ ...profile, subscription_status: "active" });
    }
  }, [profile, user]);

  const handlePurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      const result = await purchasePackage(pkg);
      if (result.success && profile && user) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("id", user.id);
        setProfile({ ...profile, subscription_status: "active" });
      }
      return result;
    },
    [profile, user]
  );

  const handleRestore = useCallback(async () => {
    const result = await restorePurchases();
    if (result.success && profile && user) {
      await supabase
        .from("profiles")
        .update({ subscription_status: "active" })
        .eq("id", user.id);
      setProfile({ ...profile, subscription_status: "active" });
    }
    return result.success;
  }, [profile, user]);

  const monthlyPackage = offering?.availablePackages.find(
    (p) => p.packageType === "MONTHLY"
  ) ?? null;

  const annualPackage = offering?.availablePackages.find(
    (p) => p.packageType === "ANNUAL"
  ) ?? null;

  const lifetimePackage = offering?.availablePackages.find(
    (p) => p.packageType === "LIFETIME"
  ) ?? null;

  return {
    subscriptionStatus: profile?.subscription_status ?? "trial",
    isTrialExpired: isTrialExpired(),
    offering,
    monthlyPackage,
    annualPackage,
    lifetimePackage,
    isLoadingOfferings,
    syncSubscription,
    handlePurchase,
    handleRestore,
    loadOfferings,
  };
}
