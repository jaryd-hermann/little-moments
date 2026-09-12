import { useEffect, useMemo } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { parseISO, differenceInCalendarDays } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/store/authStore";
import { useEntryStore } from "@/store/entryStore";
import { launchMagicFill } from "@/lib/magicFillLaunch";
import { MagicFillPeachPillButton } from "@/components/magic-fill/MagicFillPeachPillButton";
import { useCatchUpPromptStore } from "@/store/catchUpPromptStore";

/**
 * Full-screen "you've missed a few days" prompt, shown once a week at most
 * after a lapse of more than {@link CATCH_UP_IDLE_DAYS} days. Points the user
 * straight at Magic Fill, which is the fastest way back in.
 */
export function CatchUpModalHost() {
  const { colors } = useTheme();
  const posthog = usePostHog();
  const visible = useCatchUpPromptStore((s) => s.visible);
  const maybeShow = useCatchUpPromptStore((s) => s.maybeShow);
  const dismiss = useCatchUpPromptStore((s) => s.dismiss);
  const entries = useEntryStore((s) => s.entries);
  const isLoadingEntries = useEntryStore((s) => s.isLoading);
  const displayName = useAuthStore((s) => s.profile?.display_name);
  const insets = useSafeAreaInsets();

  const firstName = useMemo(
    () => displayName?.trim().split(/\s+/)[0] ?? null,
    [displayName]
  );

  const daysSinceLastCapture = useMemo(() => {
    let latest: Date | null = null;
    for (const e of entries) {
      if (e.entry_type !== "moment" || !e.entry_date) continue;
      const d = parseISO(`${e.entry_date}T12:00:00`);
      if (!latest || d > latest) latest = d;
    }
    return latest ? differenceInCalendarDays(new Date(), latest) : null;
  }, [entries]);

  useEffect(() => {
    // Entries arrive asynchronously; an empty list mid-load would read as an
    // infinite lapse and fire the modal at users who captured yesterday.
    if (isLoadingEntries || entries.length === 0) return;
    if (daysSinceLastCapture == null) return;
    if (maybeShow(daysSinceLastCapture)) {
      posthog.capture("catch_up_modal_viewed", {
        days_since_last_capture: daysSinceLastCapture,
      });
    }
  }, [
    isLoadingEntries,
    entries.length,
    daysSinceLastCapture,
    maybeShow,
    posthog,
  ]);

  const handleMagicFill = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    posthog.capture("magic_fill_entry_tapped", {
      source: "catch_up_modal",
      days_since_last_capture: daysSinceLastCapture ?? 0,
    });
    dismiss();
    launchMagicFill("catch_up_modal");
  };

  const handleSkip = () => {
    posthog.capture("catch_up_modal_skipped", {
      days_since_last_capture: daysSinceLastCapture ?? 0,
    });
    dismiss();
    router.push("/(tabs)/today");
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={dismiss}>
      {/*
        Explicit inset padding rather than `SafeAreaView` — inside a `Modal`
        the safe area isn't picked up, so the close button rides the status bar.
      */}
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: Math.max(insets.top, 20),
          paddingBottom: insets.bottom,
        }}
      >
        <View style={{ alignItems: "flex-end", paddingHorizontal: 20 }}>
          <Pressable
            onPress={dismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ padding: 8 }}
          >
            <Ionicons name="close" size={26} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 32,
            paddingBottom: 40,
          }}
        >
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 34,
              lineHeight: 40,
              color: colors.text,
              textAlign: "center",
            }}
          >
            {firstName ? `Hey ${firstName}, you've` : "You've"} missed a few
            days.
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 16,
              lineHeight: 24,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 16,
            }}
          >
            We made it really easy for you to catch up on what mattered.
          </Text>

          <MagicFillPeachPillButton
            label="✦ Magic fill"
            onPress={handleMagicFill}
            accessibilityLabel="Catch up with Magic Fill"
            size="large"
            fullWidth
            style={{ marginTop: 36 }}
          />

          <Pressable
            onPress={handleSkip}
            style={{ alignSelf: "center", marginTop: 20, paddingVertical: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
          >
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 15,
                color: colors.textSecondary,
                textDecorationLine: "underline",
              }}
            >
              Skip for now
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
