import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useMediaLibrary, hasFullPhotoLibraryAccess } from "@/hooks/useMediaLibrary";
import { useFullPhotoAccessExplainer } from "@/hooks/useFullPhotoAccessExplainer";
import { magicFillHeadlineStyle } from "@/lib/magicFillTypography";
import {
  useMagicFillStore,
  type MagicFillGapTarget,
} from "@/store/magicFillStore";
import { MagicFillScreenHeader } from "@/components/magic-fill/MagicFillScreenHeader";
import { MagicFillPrimaryButton } from "@/components/magic-fill/MagicFillPrimaryButton";
import { PhotoAccessNudgeCard } from "@/components/common/PhotoAccessNudgeCard";

const GAP_OPTIONS: MagicFillGapTarget[] = [5, 10, 15];

export default function MagicFillIndexScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const posthog = usePostHog();
  const { source, empty } = useLocalSearchParams<{
    source?: string;
    empty?: string;
  }>();
  const gapTarget = useMagicFillStore((s) => s.gapTarget);
  const setGapTarget = useMagicFillStore((s) => s.setGapTarget);
  const {
    requestPermission,
    checkPermission,
    permissionStatus,
    accessPrivileges,
  } = useMediaLibrary();
  const { ensureFullPhotoAccess, fullPhotoAccessModal } = useFullPhotoAccessExplainer({
    checkPermission,
    requestPermission,
  });
  const hasFullAccess = hasFullPhotoLibraryAccess(
    permissionStatus,
    accessPrivileges
  );

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );

  const handleFindMoments = async () => {
    if (!hasFullAccess) {
      const ok = await ensureFullPhotoAccess();
      if (!ok) return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_range_selected", {
      gap_target: gapTarget,
      source: source ?? "unknown",
    });
    router.push("/magic-fill/searching");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {fullPhotoAccessModal}
      <MagicFillScreenHeader />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 24),
        }}
      >
        <Text
          style={magicFillHeadlineStyle({
            fontSize: 28,
            lineHeight: 34,
            color: colors.text,
            textAlign: "center",
            marginBottom: 8,
          })}
        >
          How many moments should we fill?
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 15,
            lineHeight: 22,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          We'll find the most recent days with photos but no moment yet — as far
          back as your camera roll goes.
        </Text>

        {!hasFullAccess ? (
          <PhotoAccessNudgeCard
            headline="Grant photo access to Magic fill"
            subtitle="We need full gallery access to find days with photos waiting to become moments."
            primaryLabel="CONTINUE"
            onPrimaryPress={() => void ensureFullPhotoAccess()}
            onWordFallbackPress={undefined}
          />
        ) : (
          <View style={{ gap: 12, marginBottom: 24 }}>
            {GAP_OPTIONS.map((opt) => {
              const selected = gapTarget === opt;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setGapTarget(opt);
                  }}
                  style={{
                    borderRadius: 18,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected
                      ? `${colors.primary}22`
                      : colors.surface,
                    paddingVertical: 22,
                    paddingHorizontal: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={magicFillHeadlineStyle({
                      fontSize: 40,
                      lineHeight: 44,
                      color: colors.text,
                    })}
                  >
                    {opt}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 16,
                      color: colors.textSecondary,
                    }}
                  >
                    missing days
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={{ marginTop: "auto" }}>
          {empty === "1" ? (
            <Text
              style={{
                fontFamily: "Roboto-Regular",
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 16,
              }}
            >
              No missing days with photos waiting. Try a higher number or capture
              a new moment today.
            </Text>
          ) : null}
          <MagicFillPrimaryButton
            label="Find my moments"
            variant="pink"
            onPress={() => void handleFindMoments()}
            disabled={!hasFullAccess}
          />
        </View>
      </ScrollView>
    </View>
  );
}
