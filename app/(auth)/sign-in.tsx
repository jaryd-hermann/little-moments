import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";

export default function SignInScreen() {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [error, setError] = useState("");
  const setProfile = useAuthStore((s) => s.setProfile);
  const { colors } = useTheme();

  const handleAuthSuccess = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      setProfile(profile);
      if (!profile.onboarding_completed) {
        router.replace("/(auth)/onboarding");
      } else {
        router.replace("/(tabs)/today");
      }
    } else {
      router.replace("/(auth)/onboarding");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 48,
            color: colors.text,
            marginTop: 48,
          }}
        >
          The First{"\n"}Moment.
        </Text>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Italic",
            fontSize: 18,
            color: colors.textMuted,
            marginTop: 8,
          }}
        >
          Begin your story.
        </Text>

        {error ? (
          <Text className="mt-4 text-sm text-red-500">
            {error}
          </Text>
        ) : null}

        <View style={{ marginTop: 48, gap: 16 }}>
          <AppleSignInButton
            onSuccess={handleAuthSuccess}
            onError={setError}
          />

          <GoogleSignInButton
            onSuccess={handleAuthSuccess}
            onError={setError}
          />

          <Pressable
            onPress={() => setShowEmailForm(!showEmailForm)}
            style={{
              height: 52,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              CONTINUE WITH EMAIL
            </Text>
          </Pressable>
        </View>

        {showEmailForm && (
          <EmailAuthForm onSuccess={handleAuthSuccess} />
        )}

        <View className="mt-auto pt-8">
          <Text
            style={{
              fontFamily: "Roboto-Light",
              fontSize: 12,
              color: colors.textMuted,
              textAlign: "center",
              lineHeight: 18,
            }}
          >
            By continuing, I confirm that I am 13 or older and agree to the{" "}
            <Text
              style={{ textDecorationLine: "underline" }}
              onPress={() =>
                Linking.openURL("https://littlemoments.app/terms")
              }
            >
              Terms
            </Text>
            {" "}and{" "}
            <Text
              style={{ textDecorationLine: "underline" }}
              onPress={() =>
                Linking.openURL("https://littlemoments.app/privacy")
              }
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
