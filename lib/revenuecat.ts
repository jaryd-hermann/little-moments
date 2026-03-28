import Purchases, {
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from "react-native-purchases";
import Constants from "expo-constants";

const ENTITLEMENT_ID = "Little Moments";

export function configureRevenueCat(appUserID?: string) {
  const apiKey = Constants.expoConfig?.extra?.revenuecatIosKey;
  if (!apiKey) {
    console.warn("RevenueCat: No API key found. Skipping configuration.");
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  Purchases.configure({
    apiKey,
    appUserID: appUserID ?? undefined,
  });
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
