import {
  Alert,
  Pressable,
  Text,
  View,
  Image,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import {
  GoogleSignin,
  statusCodes,
  isCancelledResponse,
  isErrorWithCode,
} from "@react-native-google-signin/google-signin";
import { supabase } from "@/lib/supabase";

const GOOGLE_BTN_INK = "#000000";
const GOOGLE_BTN_BG = "#FFFFFF";
const BUTTON_HEIGHT = 52;

const GOOGLE_ICON = require("@/assets/images/googleg-color.png");

const LOG = "[Auth/Google]";

/**
 * Native @react-native-google-signin does not supply the *raw* OIDC nonce Supabase hashes
 * and compares to the ID token. Do not pass the JWT `nonce` claim as `nonce` — that yields
 * “Nonces mismatch”. Enable “Skip nonce check” on the Google provider in Supabase instead.
 */
function appendNativeGoogleNonceHint(message: string): string {
  if (!/nonce/i.test(message)) return message;
  return `${message}\n\nNative Google Sign-In: In Supabase Dashboard go to Authentication → Providers → Google and turn on “Skip nonce check”.`;
}

const extra = Constants.expoConfig?.extra as
  | { googleWebClientId?: string; googleIosClientId?: string }
  | undefined;
const webClientId = extra?.googleWebClientId?.trim();
const iosClientId = extra?.googleIosClientId?.trim();

function expectedIosUrlSchemeFromClientId(id: string): string | null {
  const suffix = ".apps.googleusercontent.com";
  const idx = id.toLowerCase().lastIndexOf(suffix);
  if (idx === -1) return null;
  return `com.googleusercontent.apps.${id.slice(0, idx)}`;
}

let googleConfigured = false;
if (webClientId) {
  GoogleSignin.configure({
    webClientId,
    ...(Platform.OS === "ios" && iosClientId ? { iosClientId } : {}),
  });
  googleConfigured = true;
  if (__DEV__) {
    const scheme =
      Platform.OS === "ios" && iosClientId
        ? expectedIosUrlSchemeFromClientId(iosClientId)
        : null;
    console.log(
      `${LOG} configured webClientId=${webClientId.slice(0, 24)}… iosClientId=${iosClientId ? `${iosClientId.slice(0, 24)}…` : "(missing — add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)"} expectedIosUrlScheme=${scheme ?? "n/a"}`
    );
    if (Platform.OS === "ios" && !iosClientId) {
      console.warn(
        `${LOG} iOS needs EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in app.config at prebuild; without it the reversed URL scheme is not added to Info.plist.`
      );
    }
  }
}

function formatGoogleError(e: unknown): string {
  if (isErrorWithCode(e)) {
    if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return "Google Play services are missing or need an update.";
    }
    if (e.code === statusCodes.IN_PROGRESS) {
      return "Sign-in is already in progress. Try again in a moment.";
    }
    if (e.code === statusCodes.SIGN_IN_REQUIRED) {
      return "Please choose a Google account to continue.";
    }
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return "Google sign-in failed. Please try again.";
}

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!googleConfigured) {
      console.warn(`${LOG} Not configured (missing web client id in Constants.expoConfig.extra)`);
      Alert.alert(
        "Not available",
        "Google Sign-In needs a dev build and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your environment. Check app.config extra and rebuild."
      );
      return;
    }

    console.log(`${LOG} signIn() starting (native module should open Google UI if URL schemes are registered)`);
    try {
      if (Platform.OS === "android") {
        await GoogleSignin.hasPlayServices({
          showPlayServicesUpdateDialog: true,
        });
      }

      const response = await GoogleSignin.signIn();

      if (isCancelledResponse(response)) {
        console.log(`${LOG} User canceled`);
        return;
      }

      if (response.type !== "success") {
        console.warn(`${LOG} Non-success response type:`, response.type);
        onError("Google sign-in was not completed.");
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        onError(
          "Google did not return an ID token. In Google Cloud Console, create an OAuth Web client ID and set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to it. Enable the Google provider in Supabase Auth."
        );
        return;
      }

      console.log(`${LOG} Got idToken from Google, exchanging with Supabase…`);
      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (error) {
        const msg = appendNativeGoogleNonceHint(error.message);
        console.warn(`${LOG} signInWithIdToken:`, error.message);
        onError(msg);
        return;
      }

      console.log(`${LOG} OK`);
      onSuccess();
    } catch (e: unknown) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log(`${LOG} Canceled`);
        return;
      }
      console.warn(`${LOG} Error:`, e);
      onError(formatGoogleError(e));
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      android_ripple={{ color: "rgba(0,0,0,0.08)" }}
      style={({ pressed }) => ({
        width: "100%",
        opacity: pressed ? 0.94 : 1,
      })}
    >
      <View
        style={{
          width: "100%",
          height: BUTTON_HEIGHT,
          borderRadius: 9999,
          backgroundColor: GOOGLE_BTN_BG,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
        }}
      >
        <Image
          source={GOOGLE_ICON}
          style={{ width: 20, height: 20, marginRight: 8 }}
          resizeMode="contain"
        />
        <Text
          style={[
            {
              color: GOOGLE_BTN_INK,
              letterSpacing: Platform.OS === "ios" ? -0.3 : 0,
            },
            Platform.OS === "ios"
              ? { fontSize: 19, fontWeight: "600" as const }
              : {
                  fontFamily: "Roboto-Medium",
                  fontSize: 18,
                  includeFontPadding: false,
                },
          ]}
        >
          Continue with Google
        </Text>
      </View>
    </Pressable>
  );
}
