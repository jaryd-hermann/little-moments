import { OneSignal, LogLevel } from "react-native-onesignal";

const appId = process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID?.trim();

let initialized = false;

/**
 * OneSignal for marketing / one-off pushes. Chapter and other flows stay on expo-notifications.
 * Does not call requestPermission — reuse the system prompt from your existing notification UX.
 */
export function initOneSignal(): void {
  if (!appId || initialized) return;
  initialized = true;
  if (__DEV__) {
    OneSignal.Debug.setLogLevel(LogLevel.Verbose);
  }
  OneSignal.initialize(appId);
}

export function syncOneSignalUser(userId: string | null): void {
  if (!appId || !initialized) return;
  if (userId) {
    OneSignal.login(userId);
  } else {
    OneSignal.logout();
  }
}
