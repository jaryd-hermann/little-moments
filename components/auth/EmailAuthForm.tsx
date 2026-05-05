import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { PostHogMaskView } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  onSuccess: () => void;
}

export function EmailAuthForm({ onSuccess }: Props) {
  const { colors } = useTheme();
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const validate = () => {
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return false;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return false;
    }
    if (isSignUp && password !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError("");
    if (!validate()) return;

    setLoading(true);
    try {
      const emailTrim = email.trim();

      if (isSignUp) {
        const { error: signUpError, data } = await supabase.auth.signUp({
          email: emailTrim,
          password,
        });

        if (signUpError) {
          if (/already registered|already been registered/i.test(signUpError.message)) {
            setIsSignUp(false);
            setConfirmPassword("");
            setError("Looks like you already have an account \u2014 enter your password to log in.");
            return;
          }
          setError(signUpError.message);
          return;
        }
        if (data.session) {
          onSuccess();
          return;
        }

        const { error: signInError, data: signInData } =
          await supabase.auth.signInWithPassword({
            email: emailTrim,
            password,
          });
        if (!signInError && signInData.session) {
          onSuccess();
          return;
        }

        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 100));
          const { data: s } = await supabase.auth.getSession();
          if (s.session) {
            onSuccess();
            return;
          }
        }

        if (
          signInError &&
          /confirm|verify|not confirmed/i.test(signInError.message)
        ) {
          setError(
            "Check your email to confirm your account, then log in."
          );
          return;
        }
        if (signInError) {
          setError(signInError.message);
          return;
        }
        setError(
          "Could not finish sign-in. Try \u201CLog in\u201D with the same email and password."
        );
        return;
      }

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: emailTrim,
          password,
        });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Roboto-Regular",
    fontSize: 15,
    color: colors.text,
  } as const;

  const focusedBorder = {
    borderWidth: 2,
    borderColor: colors.primary,
  } as const;

  return (
    <View style={{ marginTop: 16 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        onFocus={() => setFocusedField("email")}
        onBlur={() => setFocusedField(null)}
        style={{ ...inputStyle, marginBottom: 12, ...(focusedField === "email" && focusedBorder) }}
        placeholderTextColor={colors.textMuted}
      />

      {/* PostHogMaskView masks this subtree in session replays so passwords
          never make it into recordings, even though `maskAllTextInputs` is
          off globally. The eye toggle stays inside the masked region too —
          a wide-open frame after tapping it would otherwise leak the
          password as plaintext-rendered <Text>. */}
      <PostHogMaskView style={{ marginBottom: 12 }}>
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          onFocus={() => setFocusedField("password")}
          onBlur={() => setFocusedField(null)}
          style={{ ...inputStyle, paddingRight: 48, ...(focusedField === "password" && focusedBorder) }}
          placeholderTextColor={colors.textMuted}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={8}
          style={{
            position: "absolute",
            right: 14,
            top: 0,
            bottom: 0,
            justifyContent: "center",
          }}
        >
          <Ionicons
            name={showPassword ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      </PostHogMaskView>

      {isSignUp && (
        <PostHogMaskView style={{ marginBottom: 12 }}>
          <TextInput
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
            onFocus={() => setFocusedField("confirm")}
            onBlur={() => setFocusedField(null)}
            style={{ ...inputStyle, paddingRight: 48, ...(focusedField === "confirm" && focusedBorder) }}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            onPress={() => setShowConfirm((v) => !v)}
            hitSlop={8}
            style={{
              position: "absolute",
              right: 14,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={showConfirm ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        </PostHogMaskView>
      )}

      {error ? (
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            color: "#EF4444",
            marginBottom: 12,
          }}
        >
          {error}
        </Text>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={loading}
        style={{
          height: 52,
          borderRadius: 9999,
          backgroundColor: colors.text,
          alignItems: "center",
          justifyContent: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: colors.background,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {isSignUp ? "CREATE ACCOUNT" : "LOG IN"}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsSignUp(!isSignUp);
          setError("");
        }}
        style={{ marginTop: 16 }}
      >
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 13,
            color: colors.textMuted,
            textAlign: "center",
          }}
        >
          {isSignUp
            ? "Already have an account? Log in"
            : "New here? Create account"}
        </Text>
      </Pressable>
    </View>
  );
}
