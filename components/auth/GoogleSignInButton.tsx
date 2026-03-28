import { Alert, Pressable, Text } from "react-native";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";

let GoogleSignin: any = null;
let statusCodes: any = null;
let nativeModuleAvailable = false;

try {
  const mod = require("@react-native-google-signin/google-signin");
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
  const webClientId = Constants.expoConfig?.extra?.googleWebClientId;
  if (webClientId) {
    GoogleSignin.configure({ webClientId });
    nativeModuleAvailable = true;
  }
} catch {
  nativeModuleAvailable = false;
}

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: Props) {
  const handlePress = async () => {
    if (!nativeModuleAvailable) {
      Alert.alert(
        "Not available",
        "Google Sign-In requires a development build. Use email or Apple sign-in in Expo Go."
      );
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken;

      if (!idToken) {
        onError("No ID token received from Google");
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: idToken,
      });

      if (error) {
        onError(error.message);
        return;
      }

      onSuccess();
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === statusCodes?.SIGN_IN_CANCELLED) return;
      onError("Google sign-in failed. Please try again.");
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        height: 52,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: "rgba(255, 255, 255, 0.3)",
        alignItems: "center",
        justifyContent: "center",
        opacity: nativeModuleAvailable ? 1 : 0.5,
      }}
    >
      <Text
        style={{
          fontFamily: "Roboto-Medium",
          fontSize: 15,
          color: "#FFFFFF",
          letterSpacing: 0.8,
          textTransform: "uppercase",
        }}
      >
        CONTINUE WITH GOOGLE
      </Text>
    </Pressable>
  );
}
