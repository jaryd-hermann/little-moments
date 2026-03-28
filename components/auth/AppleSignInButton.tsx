import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "@/lib/supabase";

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

export function AppleSignInButton({ onSuccess, onError }: Props) {
  if (Platform.OS !== "ios") return null;

  const handlePress = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        onError("No identity token received from Apple");
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });

      if (error) {
        onError(error.message);
        return;
      }

      onSuccess();
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "ERR_REQUEST_CANCELED") return;
      onError("Apple sign-in failed. Please try again.");
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={
        AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
      }
      buttonStyle={
        AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
      }
      cornerRadius={9999}
      style={{ width: "100%", height: 52 }}
      onPress={handlePress}
    />
  );
}
