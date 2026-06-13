import { useEffect, useState } from "react";
import { View, ScrollView, Image, StatusBar, Text } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useMediaLibrary } from "@/hooks/useMediaLibrary";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { PhotoAccessNudgeCard } from "@/components/common/PhotoAccessNudgeCard";
import { FullPhotoLibraryAccessModal } from "@/components/common/FullPhotoLibraryAccessModal";
import { queryRecentCameraPhotos } from "@/hooks/useMediaLibrary";
import { useOnboardingMontageStore } from "@/store/onboardingMontageStore";
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
  const [skipModalVisible, setSkipModalVisible] = useState(false);

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
        .update({ onboarding_phase: "notifications" })
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
    router.replace("/(auth)/notifications-prompt");
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
      void queryRecentCameraPhotos({ daysBack: 30, limit: 20 }).then(
        (assets) => useOnboardingMontageStore.getState().setAssets(assets)
      );
      await advanceTo("photo");
    } else {
      await advanceTo("word", "os_denied");
    }
  };

  const handleSkipLinkPress = () => {
    posthog.capture(
      "photo_permission_skip_link_tapped",
      onboardingEventProps(3)
    );
    setSkipModalVisible(true);
  };

  const handleSkipModalContinue = async () => {
    setSkipModalVisible(false);
    await handleAllow();
  };

  const handleSkipModalSkip = async () => {
    setSkipModalVisible(false);
    posthog.capture(
      "photo_permission_resolved",
      onboardingEventProps(3, {
        result: "dismissed",
        trigger: "skip",
      })
    );
    await advanceTo("word", "user_skipped");
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
      <FullPhotoLibraryAccessModal
        visible={skipModalVisible}
        onClose={() => setSkipModalVisible(false)}
        onAllowAccess={handleSkipModalContinue}
        title="Photo access keeps Little Moments working"
        body={
          <>
            Little Moments surfaces photos from your camera roll one day at a time so
            you can pick what mattered. We need{" "}
            <Text style={{ fontFamily: "Roboto-Bold" }}>full photo access</Text> for
            that to work — nothing leaves your device until you save a moment.
          </>
        }
        primaryCtaLabel="Continue"
        secondaryCtaLabel="Skip permission"
        onSecondaryCtaPress={handleSkipModalSkip}
      />
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
            headline="Pick from your day's photos"
            headlineFontFamily="PMGothicLudington-Text110"
            headlineFontSize={30}
            subtitle="Each day, we'll show you photos from that day so you choose which one mattered. Nothing leaves your device until you save a moment."
            primaryLabel="ALLOW PHOTOS"
            wordFallbackLabel="I don't want to use photos"
            showSecondaryOrPrefix={false}
            onPrimaryPress={handleAllow}
            onWordFallbackPress={handleSkipLinkPress}
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
