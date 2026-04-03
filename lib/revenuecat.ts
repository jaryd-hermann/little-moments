import Purchases, {
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from "react-native-purchases";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";

/**
 * Store setup (App Store Connect + RevenueCat dashboard):
 * - Put monthly and annual SKUs in the same subscription group so users can change plans in Apple’s UI.
 * - Map both products to this entitlement in RevenueCat.
 * - Configure Customer Center in the RevenueCat dashboard (help links, optional upgrade paths).
 */
const ENTITLEMENT_ID = "Little Moments";

const APPLE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
const PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions";

export function configureRevenueCat(appUserID?: string) {
  const apiKey = Constants.expoConfig?.extra?.revenuecatIosKey;
  if (!apiKey) {
    console.warn("RevenueCat: No API key found. Skipping configuration.");
    return;
  }

  try {
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
    Purchases.configure({
      apiKey,
      appUserID: appUserID ?? undefined,
    });
  } catch (e) {
    console.warn("RevenueCat: configuration failed", e);
  }
}

export async function identifyUser(userId: string) {
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn("RevenueCat: Failed to identify user", e);
  }
}

export async function logOutRevenueCat() {
  try {
    await Purchases.logOut();
  } catch {
    // Anonymous user or already logged out
  }
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

export function hasActiveEntitlement(customerInfo: CustomerInfo): boolean {
  return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

export async function checkEntitlementStatus(): Promise<"active" | "expired" | "none"> {
  const info = await getCustomerInfo();
  if (!info) return "none";
  if (hasActiveEntitlement(info)) return "active";
  return "none";
}

export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo; cancelled?: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const active = hasActiveEntitlement(customerInfo);
    return { success: active, customerInfo };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean };
    if (err.userCancelled) {
      return { success: false, cancelled: true };
    }
    throw e;
  }
}

export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
}> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const active = hasActiveEntitlement(customerInfo);
    return { success: active, customerInfo };
  } catch {
    return { success: false };
  }
}

/** Latest subscriber state from the store (e.g. after Customer Center or a purchase elsewhere). */
export async function syncPurchasesForCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    const { customerInfo } = await Purchases.syncPurchasesForResult();
    return customerInfo;
  } catch {
    return null;
  }
}

/**
 * Opens the platform subscription management UI when possible; otherwise the store URL.
 * iOS: StoreKit manage sheet (iOS 13+), else Apple subscriptions web URL.
 */
export async function openStoreSubscriptionManagement(): Promise<void> {
  if (Platform.OS === "ios") {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
      return;
    }
  }
  await Linking.openURL(PLAY_SUBSCRIPTIONS_URL);
}
