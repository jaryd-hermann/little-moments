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
import { supabase } from "@/lib/supabase";

interface Props {
  onSuccess: () => void;
}

export function EmailAuthForm({ onSuccess }: Props) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Roboto-Regular",
    fontSize: 15,
    color: "#FFFFFF",
  } as const;

  return (
    <View style={{ marginTop: 16 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={{ ...inputStyle, marginBottom: 12 }}
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
      />

      <View style={{ marginBottom: 12 }}>
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          style={{ ...inputStyle, paddingRight: 48 }}
          placeholderTextColor="rgba(255, 255, 255, 0.3)"
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
            color="rgba(255, 255, 255, 0.4)"
          />
        </Pressable>
      </View>

      {isSignUp && (
        <View style={{ marginBottom: 12 }}>
          <TextInput
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
            style={{ ...inputStyle, paddingRight: 48 }}
            placeholderTextColor="rgba(255, 255, 255, 0.3)"
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
              color="rgba(255, 255, 255, 0.4)"
            />
          </Pressable>
        </View>
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
          backgroundColor: "#FFFFFF",
          alignItems: "center",
          justifyContent: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#000000" />
        ) : (
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#000000",
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
            color: "rgba(255, 255, 255, 0.5)",
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
