import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants from "expo-constants";
import { sha256 } from "js-sha256";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { jwtAudience, readJwtPayload } from "@/lib/jwtPayload";

const LOG = "[Auth/Apple]";

interface Props {
  onSuccess: () => void;
  onError: (msg: string) => void;
}

function createRawNonce(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as Error).message === "string") {
    return (e as Error).message;
  }
  return "Apple sign-in failed. Please try again.";
}

export function AppleSignInButton({ onSuccess, onError }: Props) {
  if (Platform.OS !== "ios") return null;

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const bundleId =
        Constants.expoConfig?.ios?.bundleIdentifier ?? "(unknown bundle id)";
      console.log(`${LOG} Starting Sign in with Apple (bundle: ${bundleId})`);

      const rawNonce = createRawNonce();
      const nonceSha256Hex = sha256(rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: nonceSha256Hex,
      });

      if (!credential.identityToken) {
        console.warn(`${LOG} Apple returned no identityToken`);
        onError("No identity token received from Apple.");
        return;
      }

      const aud = jwtAudience(credential.identityToken);
      const payload = readJwtPayload(credential.identityToken);
      const iss = typeof payload?.iss === "string" ? payload.iss : undefined;
      console.log(
        `${LOG} identityToken decoded claims: aud=${aud ?? "?"} iss=${iss ?? "?"} (sub present: ${Boolean(payload?.sub)})`
      );
      console.log(
        `${LOG} Supabase Auth → Providers → Apple → Client ID must equal aud for native iOS (usually your bundle id: ${bundleId}). It must NOT be the Services ID unless you use the web flow, and it is not the "38N…com…" key configuration line from developer.apple.com.`
      );

      console.log(`${LOG} Calling supabase.auth.signInWithIdToken (provider=apple, nonce sent)`);
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        console.warn(`${LOG} signInWithIdToken error:`, error.message, error);
        onError(error.message);
        return;
      }

      console.log(`${LOG} OK session user id: ${data?.user?.id ?? "none"}`);
      onSuccess();
    } catch (e: unknown) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: string }).code)
          : "";
      if (code === "ERR_REQUEST_CANCELED") {
        console.log(`${LOG} User canceled Apple sheet`);
        return;
      }
      console.warn(`${LOG} signInAsync or other error:`, e);
      onError(errorMessage(e));
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
