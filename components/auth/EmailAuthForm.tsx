import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { supabase } from "@/lib/supabase";

interface Props {
  onSuccess: () => void;
}

export function EmailAuthForm({ onSuccess }: Props) {
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    setError("");
    if (!validate()) return;

    setLoading(true);
    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      } else {
        const { error: signInError } =
          await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
          return;
        }
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
    marginBottom: 12,
  } as const;

  return (
    <View style={{ marginTop: 16 }}>
      <TextInput
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        style={inputStyle}
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
      />

      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={inputStyle}
        placeholderTextColor="rgba(255, 255, 255, 0.3)"
      />

      {isSignUp && (
        <TextInput
          placeholder="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          style={inputStyle}
          placeholderTextColor="rgba(255, 255, 255, 0.3)"
        />
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
