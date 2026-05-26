import { useEffect } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { parseISO } from "date-fns";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import { useFirstMomentOnboardingSheetStore } from "@/store/firstMomentOnboardingSheetStore";
import { useEntryStore } from "@/store/entryStore";
import { TodayEntryCard } from "@/components/today/TodayEntryCard";

/** Slide-up “toaster” after the user’s first moment in onboarding (Capture tab). */
export function FirstMomentOnboardingSheetHost() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const visible = useFirstMomentOnboardingSheetStore((s) => s.visible);
  const entryId = useFirstMomentOnboardingSheetStore((s) => s.entryId);
  const dismiss = useFirstMomentOnboardingSheetStore((s) => s.dismiss);
  const entry = useEntryStore((s) =>
    entryId ? s.entries.find((e) => e.id === entryId) : undefined,
  );

  useEffect(() => {
    if (visible && entryId) {
      posthog.capture("first_moment_onboarding_sheet_viewed", {
        entry_id: entryId,
      });
    }
  }, [visible, entryId, posthog]);

  const handleTryDigDeeper = () => {
    if (!entry) {
      dismiss();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("first_moment_onboarding_try_dig_deeper", {
      entry_id: entry.id,
    });
    dismiss();
    router.push({
      pathname: "/dig-deeper",
      params: {
        entryId: entry.id,
        title: entry.title ?? "",
        body: entry.body ?? "",
        photoUri: entry.media?.[0]?.storage_url ?? "",
      },
    });
  };

  const handleViewCapsule = () => {
    if (entry) {
      posthog.capture("first_moment_onboarding_view_capsule", {
        entry_id: entry.id,
      });
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dismiss();
    router.push("/(tabs)/memories");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={dismiss}
    >
      <Pressable
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
        onPress={dismiss}
        accessibilityLabel="Dismiss"
      >
        <Pressable
          onPress={() => {}}
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: colors.surface,
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 32,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              height: 4,
              width: 40,
              borderRadius: 2,
              backgroundColor: colors.borderLight,
              marginBottom: 18,
            }}
          />
          {entry ? (
            <View style={{ marginBottom: 20 }}>
              <TodayEntryCard
                entry={entry}
                selectedDate={
                  entry.entry_date
                    ? parseISO(`${entry.entry_date}T12:00:00`)
                    : new Date()
                }
                readOnly
              />
            </View>
          ) : null}
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 28,
              lineHeight: 34,
              color: colors.text,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            You captured your first moment to your Capsule!
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 15,
              lineHeight: 22,
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            Keep capturing, and we&apos;ll start building you weekly Chapters,
            and pointing out the Connections.
          </Text>
          <Pressable
            onPress={handleTryDigDeeper}
            disabled={!entry}
            style={{
              height: 56,
              borderRadius: 9999,
              backgroundColor: colors.primary,
              borderWidth: 2,
              borderColor: PINK_CTA_BORDER,
              alignItems: "center",
              justifyContent: "center",
              opacity: entry ? 1 : 0.5,
              ...bevelShadow(theme),
            }}
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: PINK_CTA_INK,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              Try Dig Deeper
            </Text>
          </Pressable>
          <Pressable
            onPress={handleViewCapsule}
            style={{ alignSelf: "center", marginTop: 16, paddingVertical: 8 }}
            accessibilityRole="link"
            accessibilityLabel="View in Capsule"
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.text,
                textDecorationLine: "underline",
              }}
            >
              View in capsule
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
