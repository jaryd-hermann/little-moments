import { useEffect } from "react";
import { View, ScrollView, Image, StatusBar } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { PhotoAccessNudgeCard } from "@/components/common/PhotoAccessNudgeCard";
import { useTheme } from "@/hooks/useTheme";
import { onboardingEventProps } from "@/lib/onboardingEvents";

const GRID_IMAGES = [
  require("@/assets/images/a.png"),
  require("@/assets/images/b.png"),
  require("@/assets/images/c.png"),
  require("@/assets/images/d.png"),
  require("@/assets/images/e.png"),
  require("@/assets/images/f.png"),
  require("@/assets/images/g.png"),
  require("@/assets/images/h.png"),
  require("@/assets/images/i.png"),
];

export default function PhotoPermissionScreen() {
  const posthog = usePostHog();
  const { colors, theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const { checkPermission, requestPermission } = useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } =
    useFullPhotoAccessExplainer({ checkPermission, requestPermission });

  useEffect(() => {
    posthog.capture("viewed_photo_permission", onboardingEventProps(3));
  }, []);

  const advanceTo = async (
    promptType: "photo" | "word",
    reason?: "os_denied" | "user_skipped"
  ) => {
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .update({ onboarding_phase: "activation" })
        .eq("id", user.id)
        .select()
        .single();
      if (data) setProfile(data as Profile);
    }
    if (promptType === "word" && reason) {
      posthog.capture(
        "photo_permission_word_fallback",
        onboardingEventProps(3, { reason })
      );
    }
    router.replace({
      pathname: "/(auth)/activation",
      params: { prompt_type: promptType },
    });
  };

  const handleAllow = async () => {
    posthog.capture(
      "photo_permission_requested",
      onboardingEventProps(3)
    );
    posthog.capture(
      "photo_permission_explainer_shown",
      onboardingEventProps(3, { trigger: "allow" })
    );
    const granted = await ensureFullPhotoAccess();
    posthog.capture(
      "photo_permission_resolved",
      onboardingEventProps(3, {
        result: granted ? "granted" : "denied",
        trigger: "allow",
      })
    );
    if (granted) {
      await advanceTo("photo");
    } else {
      await advanceTo("word", "os_denied");
    }
  };

  const handleWordFallback = async () => {
    posthog.capture(
      "photo_permission_explainer_shown",
      onboardingEventProps(3, { trigger: "skip" })
    );
    const granted = await ensureFullPhotoAccess();
    posthog.capture(
      "photo_permission_resolved",
      onboardingEventProps(3, {
        result: granted ? "granted" : "dismissed",
        trigger: "skip",
      })
    );
    if (granted) {
      await advanceTo("photo");
    } else {
      await advanceTo("word", "user_skipped");
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      {fullPhotoAccessModal}
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <PhotoGrid
          tileBorder={colors.borderLight}
          tileBg={
            theme === "dark"
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.04)"
          }
        />
        <View style={{ marginTop: 28 }}>
          <PhotoAccessNudgeCard
            onPrimaryPress={handleAllow}
            onWordFallbackPress={handleWordFallback}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PhotoGrid({
  tileBorder,
  tileBg,
}: {
  tileBorder: string;
  tileBg: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {GRID_IMAGES.map((src, i) => (
        <Image
          key={i}
          source={src}
          style={{
            flexBasis: "31.5%",
            aspectRatio: 1,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: tileBorder,
            backgroundColor: tileBg,
          }}
          resizeMode="cover"
        />
      ))}
    </View>
  );
}
