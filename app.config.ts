import { ExpoConfig, ConfigContext } from "expo/config";

const IOS_BUNDLE_ID = "com.jarydhermann.littlemoments";
const ANDROID_PACKAGE = "com.jarydhermann.littlemoments";

/**
 * iOS Google Sign-In needs `CFBundleURLSchemes` = `com.googleusercontent.apps.{CLIENT_PREFIX}`
 * where CLIENT_PREFIX is the part before `.apps.googleusercontent.com` on the iOS OAuth client ID.
 * Without this (and without GoogleService-Info.plist), the SDK errors with "missing URL schemes".
 */
function buildGoogleIosUrlScheme(iosClientId: string): string {
  const suffix = ".apps.googleusercontent.com";
  const id = iosClientId.trim();
  const idx = id.toLowerCase().lastIndexOf(suffix);
  if (idx === -1) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must be the iOS OAuth client id from Google Cloud (ends with "${suffix}").`
    );
  }
  const prefix = id.slice(0, idx);
  return `com.googleusercontent.apps.${prefix}`;
}

const googleIosClientIdEnv = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
const googleSignInPlugin: NonNullable<ExpoConfig["plugins"]>[number] =
  googleIosClientIdEnv
    ? [
        "@react-native-google-signin/google-signin",
        { iosUrlScheme: buildGoogleIosUrlScheme(googleIosClientIdEnv) },
      ]
    : "@react-native-google-signin/google-signin";

if (!googleIosClientIdEnv) {
  // eslint-disable-next-line no-console -- build-time hint for missing EAS/.env during prebuild
  console.warn(
    "[app.config] EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is unset. The Google Sign-In config plugin will not add com.googleusercontent.apps… to Info.plist; iOS will error until this is set at prebuild (local .env or eas.json env / EAS secrets)."
  );
}

/** APNs + OneSignal NSE; must match EAS/Apple setup (development for dev client, production for TestFlight/App Store). */
const oneSignalApnsMode =
  process.env.EXPO_PUBLIC_ONESIGNAL_APN_ENV?.trim().toLowerCase() === "development"
    ? "development"
    : "production";

const oneSignalAppGroup = `group.${IOS_BUNDLE_ID}.onesignal`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Little Moments",
  slug: "little-moments",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "littlemoments",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: IOS_BUNDLE_ID,
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryUsageDescription:
        "Little Moments needs access to your photos so you can attach memories to your entries.",
      NSMicrophoneUsageDescription:
        "Little Moments needs microphone access to record voice entries for transcription.",
      NSLocationWhenInUseUsageDescription:
        "Little Moments may use your location to personalize your experience.",
      UIBackgroundModes: ["remote-notification"],
    },
    entitlements: {
      "aps-environment": oneSignalApnsMode,
      "com.apple.security.application-groups": [oneSignalAppGroup],
    },
  },
  android: {
    softwareKeyboardLayoutMode: "resize",
    package: ANDROID_PACKAGE,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    versionCode: 1,
  },
  web: {
    output: "single" as const,
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    [
      "onesignal-expo-plugin",
      {
        mode: oneSignalApnsMode,
        appGroupName: oneSignalAppGroup,
      },
    ],
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#000000",
      },
    ],
    "expo-asset",
    "expo-secure-store",
    "expo-audio",
    [
      "expo-media-library",
      {
        photosPermission:
          "Little Moments needs access to your photos to help you rediscover past moments.",
        savePhotosPermission: "Allow Little Moments to save photos.",
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/icon.png",
        color: "#f0d7ff",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Little Moments needs access to your photos to attach them to entries.",
        cameraPermission:
          "Little Moments needs camera access to take photos for your entries.",
      },
    ],
    googleSignInPlugin,
    "expo-localization",
  ],
  experiments: {
    typedRoutes: true,
  },
  runtimeVersion: "1.0.0",
  extra: {
    router: {},
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    revenuecatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    /** iOS native Google Sign-In (required if GoogleService-Info.plist is not in the project). */
    googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    eas: {
      projectId: "0ff2f724-d7e1-4730-ac3b-251129aed785",
    },
  },
  owner: "jarydhermann",
});
