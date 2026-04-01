import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ViewToken,
} from "react-native";
import * as Haptics from "expo-haptics";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { AppleSignInButton } from "@/components/auth/AppleSignInButton";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { EmailAuthForm } from "@/components/auth/EmailAuthForm";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import { routeAfterAuth } from "@/lib/onboardingRoute";

const WORDMARK = require("@/assets/images/wordmark-little-moments.png");

const BENEFIT_SLIDES = [
  {
    parts: [
      { text: "Tens of thousands of people say it replaced therapy." },
    ],
    bold: "It takes 5 minutes.",
  },
  {
    parts: [
      { text: "A few sentences a day", color: "primary" },
      { text: " are all it takes to preserve your life story and create a collection of memories you\u2019ll cherish." },
    ],
  },
  {
    parts: [
      { text: "No more forgotten moments. No more \u201CI wish I had written that down.\u201D " },
      { text: "No more unnoticing.", color: "primary" },
    ],
  },
];

export default function SignInScreen() {
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [error, setError] = useState("");
  const setProfile = useAuthStore((s) => s.setProfile);
  const setUser = useAuthStore((s) => s.setUser);
  const setSession = useAuthStore((s) => s.setSession);
  const { colors } = useTheme();
  const posthog = usePostHog();
  const signUpMethodRef = useRef<"apple" | "google" | "email">("email");
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<FlatList>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveSlide(viewableItems[0].index);
      }
    },
    []
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  useEffect(() => {
    if (!showEmailForm) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 250);
    return () => clearTimeout(t);
  }, [showEmailForm]);

  const handleAuthSuccess = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    const user = session?.user;
    if (!session || !user) {
      setError("Could not establish a session. Try again.");
      return;
    }
    setSession(session);
    setUser(user);

    let profile: Profile | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        profile = data as Profile;
        break;
      }
      await new Promise((r) => setTimeout(r, 120));
    }

    setProfile(profile);

    if (
      profile?.created_at &&
      Date.now() - new Date(profile.created_at).getTime() < 60_000
    ) {
      posthog.capture("created_account", {
        method: signUpMethodRef.current,
      });
    }

    routeAfterAuth(profile);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{
            flexGrow: 1,
            padding: 24,
            paddingBottom: 32,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
          }}
        >
        <View
          style={{
            alignItems: "center",
            marginTop: 16,
            width: "100%",
          }}
        >
          <Image
            source={WORDMARK}
            style={{ width: 300, height: 72 }}
            resizeMode="contain"
            accessibilityLabel="Little Moments"
          />
        </View>
        <Pressable
          onPress={() => {
            const next = (activeSlide + 1) % BENEFIT_SLIDES.length;
            carouselRef.current?.scrollToIndex({ index: next, animated: true });
          }}
          style={{ marginTop: 44 }}
          onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}
        >
          {carouselWidth > 0 && (
            <FlatList
              ref={carouselRef}
              data={BENEFIT_SLIDES}
              keyExtractor={(_, i) => String(i)}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, index) => ({
                length: carouselWidth,
                offset: carouselWidth * index,
                index,
              })}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: carouselWidth,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "LibreBaskerville-Regular",
                      fontSize: 21,
                      color: colors.textSecondary,
                      lineHeight: 30,
                      textAlign: "center",
                    }}
                  >
                    {item.parts.map((p: { text: string; color?: string }, i: number) => (
                      <Text
                        key={i}
                        style={
                          p.color === "primary"
                            ? { color: colors.primary, fontFamily: "LibreBaskerville-Bold" }
                            : undefined
                        }
                      >
                        {p.text}
                      </Text>
                    ))}
                  </Text>
                  {item.bold && (
                    <Text
                      style={{
                        fontFamily: "LibreBaskerville-Bold",
                        fontSize: 21,
                        color: colors.primary,
                        lineHeight: 30,
                        textAlign: "center",
                        marginTop: 10,
                      }}
                    >
                      {item.bold}
                    </Text>
                  )}
                </View>
              )}
            />
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              marginTop: 18,
            }}
          >
            {BENEFIT_SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    i === activeSlide ? colors.primary : colors.border,
                }}
              />
            ))}
          </View>
        </Pressable>

        {error ? (
          <Text className="mt-4 text-sm text-red-500">
            {error}
          </Text>
        ) : null}

        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingVertical: 32,
            minHeight: 260,
          }}
        >
          <View
            style={{
              gap: 16,
              width: "100%",
              alignSelf: "center",
            }}
          >
            <AppleSignInButton
              onSuccess={() => {
                signUpMethodRef.current = "apple";
                handleAuthSuccess();
              }}
              onError={setError}
            />

            <GoogleSignInButton
              onSuccess={() => {
                signUpMethodRef.current = "google";
                handleAuthSuccess();
              }}
              onError={setError}
            />

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowEmailForm(!showEmailForm);
              }}
              style={{
                height: 52,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
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
        </View>

        {showEmailForm && (
          <EmailAuthForm
            onSuccess={() => {
              signUpMethodRef.current = "email";
              handleAuthSuccess();
            }}
          />
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
