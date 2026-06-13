import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  MagicFillPrimaryButton,
} from "@/components/magic-fill/MagicFillPrimaryButton";
import { useMagicFillStore, selectedPhoto } from "@/store/magicFillStore";

export default function MagicFillSuccessScreen() {
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const savedCount = useMagicFillStore((s) => s.savedCount);
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const drafts = useMagicFillStore((s) => s.drafts);
  const resetForRestart = useMagicFillStore((s) => s.resetForRestart);

  const heroPhoto = drafts.find((d) => !d.skipped && selectedPhoto(d));
  const heroUri = heroPhoto ? selectedPhoto(heroPhoto)?.uri : null;

  const handleRestart = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_success_restart", { gap_target: gapTarget });
    resetForRestart();
    router.replace("/magic-fill");
  };

  const handleBackToCapsule = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useMagicFillStore.getState().reset();
    router.dismissAll();
    router.replace("/(tabs)/memories");
  };

  return (
    <LinearGradient
      colors={["#1A0B2E", "#0F0718", "#000000"]}
      style={{ flex: 1 }}
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 60,
          paddingBottom: Math.max(insets.bottom, 24),
          paddingHorizontal: 32,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {heroUri ? (
          <Image
            source={{ uri: heroUri }}
            style={{
              width: 88,
              height: 88,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.35)",
              marginBottom: 20,
            }}
          />
        ) : null}

        <Text
          style={magicFillHeadlineStyle({
            fontSize: 48,
            color: "#FFFFFF",
            marginBottom: 4,
          })}
        >
          +{savedCount}
        </Text>
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 18,
            color: "rgba(255,255,255,0.85)",
            marginBottom: 16,
          })}
        >
          moments added
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          Amazing job logging your life like a power journaler. Your Capsule
          just got a whole lot richer.
        </Text>

        <MagicFillPrimaryButton
          label={`Fill ${gapTarget} more moments`}
          variant="pink"
          onPress={handleRestart}
          style={{ alignSelf: "stretch", marginBottom: 16 }}
        />

        <Pressable accessibilityRole="button" onPress={handleBackToCapsule}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: "#FFFFFF",
            }}
          >
            Back to Capsule
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
