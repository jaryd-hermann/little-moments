import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "little-moments",
  slug: "little-moments",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "littlemoments",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.jarydhermann.littlemoments",
    buildNumber: "1",
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Little Moments needs access to your photos so you can attach memories to your entries.",
      NSMicrophoneUsageDescription:
        "Little Moments needs microphone access to record voice entries for transcription.",
    },
  },
  android: {
    package: "com.jarydhermann.littlemoments",
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
    "@react-native-google-signin/google-signin",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  runtimeVersion: "1.0.0",
  extra: {
    router: {},
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    revenuecatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    eas: {
      projectId: "0ff2f724-d7e1-4730-ac3b-251129aed785",
    },
  },
  owner: "jarydhermann",
});
