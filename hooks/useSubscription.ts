import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  checkEntitlementStatus,
  getCurrentOffering,
  getCustomerInfo,
  hasActiveEntitlement,
  purchasePackage,
  restorePurchases,
  syncPurchasesForCustomerInfo,
} from "@/lib/revenuecat";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";

export function useSubscription() {
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
  /** null = not loaded yet; used to open Customer Center for cancelled users who still have access */
  const [storeEntitlementActive, setStoreEntitlementActive] = useState<
    boolean | null
  >(null);

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

  const refreshStoreEntitlement = useCallback(async () => {
    if (!profile) {
      setStoreEntitlementActive(null);
      return;
    }
    const info = await getCustomerInfo();
    if (!info) {
      setStoreEntitlementActive(false);
      return;
    }
    setStoreEntitlementActive(hasActiveEntitlement(info));
  }, [profile]);

  useEffect(() => {
    void refreshStoreEntitlement();
  }, [refreshStoreEntitlement, profile?.id, profile?.subscription_status]);

  const profileSuggestsPaidSubscription =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "cancelled";

  const canManageSubscriptionInStore =
    storeEntitlementActive === true ||
    (storeEntitlementActive === null && profileSuggestsPaidSubscription);

  const syncAfterSubscriptionManagement = useCallback(async () => {
    if (!profile || !user) return;
    const customerInfo = await syncPurchasesForCustomerInfo();
    if (!customerInfo) return;
    const entitled = hasActiveEntitlement(customerInfo);
    if (entitled) {
      if (
        profile.subscription_status === "expired" ||
        profile.subscription_status === "trial"
      ) {
        await supabase
          .from("profiles")
          .update({ subscription_status: "active" })
          .eq("id", user.id);
        setProfile({ ...profile, subscription_status: "active" });
      }
    } else if (
      profile.subscription_status === "active" ||
      profile.subscription_status === "cancelled"
    ) {
      await supabase
        .from("profiles")
        .update({ subscription_status: "expired" })
        .eq("id", user.id);
      setProfile({ ...profile, subscription_status: "expired" });
    }
  }, [profile, user, setProfile]);

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
    canManageSubscriptionInStore,
    refreshStoreEntitlement,
    syncAfterSubscriptionManagement,
  };
}
