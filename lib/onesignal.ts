/**
 * OneSignal stubs.
 *
 * The native SDK (react-native-onesignal) has been removed from the build
 * because it caused unrecoverable NSException crashes during TurboModule
 * initialization (App Group provisioning issue). These are no-op stubs so
 * callers don't need to be changed.
 *
 * To re-enable OneSignal:
 * 1. Register App Group in Apple Developer Portal
 * 2. Add react-native-onesignal + onesignal-expo-plugin back to package.json
 * 3. Uncomment the plugin in app.config.ts
 * 4. Restore the real implementation here
 */

export function initOneSignal(): void {
  // no-op — native SDK removed
}

export function syncOneSignalUser(_userId: string | null): void {
  // no-op — native SDK removed
}
