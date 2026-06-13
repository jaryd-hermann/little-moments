import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Image,
  StatusBar,
  ScrollView,
  Modal,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { format, setHours, setMinutes } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import {
  requestNotificationPermissions,
  scheduleWelcomeFirstCaptureNotification,
} from "@/lib/notifications";
import { syncPushRegistration } from "@/lib/pushRegistration";
import { useSettingsStore } from "@/store/settingsStore";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { formatNotificationTimeForDb } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import {
  ONBOARDING_QUIZ_FLAG_KEY,
  shouldSkipOnboardingPaywall,
} from "@/lib/onboardingQuizFlag";
import { routeToFirstMomentScreen } from "@/lib/onboardingRoute";
import { useOnboardingQuizStore } from "@/store/onboardingQuizStore";
import { deriveCaptureRhythmFromAnswers } from "@/lib/onboardingQuiz";
import type { ReflectionTarget } from "@/lib/reflectionTarget";

const APP_ICON = require("@/assets/images/icon.png");

type CaptureRhythm = "morning" | "evening";

function suggestedReflectionTarget(rhythm: CaptureRhythm): ReflectionTarget {
  return rhythm === "morning" ? "yesterday" : "today";
}

export default function NotificationsPromptScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setNotificationEnabled = useSettingsStore(
    (s) => s.setNotificationEnabled
  );
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);

  // Pre-fill from the pre-auth quiz when the user picked a rhythm there
  // (Q3). "when_it_hits" is stored as `capture_rhythm: null` and we keep
  // the morning default. Belt-and-suspenders: if the profile flush hasn't
  // landed yet (offline, race, etc.) fall back to the local quiz answers
  // so the user's pick still drives this screen.
  const quizAnswers = useOnboardingQuizStore((s) => s.answers);
  const localQuizRhythm = deriveCaptureRhythmFromAnswers(quizAnswers);
  const seededRhythm: CaptureRhythm | null =
    profile?.capture_rhythm ?? localQuizRhythm;
  const initialRhythm: CaptureRhythm =
    seededRhythm === "morning" ? "morning" : "evening";
  const quizSeededRhythm = seededRhythm != null;

  const [rhythm, setRhythm] = useState<CaptureRhythm>(initialRhythm);
  const [reflectionTarget, setReflectionTarget] = useState<ReflectionTarget>(
    () =>
      profile?.reflection_target_default ?? suggestedReflectionTarget(initialRhythm)
  );
  const [notifHour, setNotifHour] = useState(initialRhythm === "evening" ? 21 : 8);
  const [notifMinute, setNotifMinute] = useState(0);
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const suggested = useMemo(() => suggestedReflectionTarget(rhythm), [rhythm]);

  useEffect(() => {
    setReflectionTarget(suggested);
  }, [suggested]);

  useEffect(() => {
    if (rhythm === "morning") {
      setNotifHour(8);
      setNotifMinute(0);
    } else {
      setNotifHour(21);
      setNotifMinute(0);
    }
  }, [rhythm]);

  useEffect(() => {
    posthog.capture("viewed_notifications", onboardingEventProps(6));
  }, []);

  const timeLabel = useMemo(() => {
    const d = setMinutes(setHours(new Date(), notifHour), notifMinute);
    return format(d, "h:mm a");
  }, [notifHour, notifMinute]);

  const goToNextStep = useCallback(() => {
    posthog.capture("onboarding_first_capture_routed", onboardingEventProps(6));
    if (shouldSkipOnboardingPaywall(posthog.getFeatureFlag(ONBOARDING_QUIZ_FLAG_KEY))) {
      routeToFirstMomentScreen();
      return;
    }
    router.replace({
      pathname: "/paywall/value",
      params: { fromOnboarding: "1" },
    });
  }, [posthog]);

  const finishOnboarding = async (params: {
    enabled: boolean;
    reason?: "user_skipped" | "os_denied";
  }) => {
    if (!user) return;
    const timeStr = formatNotificationTimeForDb(notifHour, notifMinute);

    const { data: fresh, error: updateError } = await supabase
      .from("profiles")
      .update({
        notification_enabled: params.enabled,
        notification_time: timeStr,
        capture_rhythm: rhythm,
        reflection_target_default: reflectionTarget,
        onboarding_phase: "done",
        onboarding_completed: true,
        story_coach_enabled: true,
      })
      .eq("id", user.id)
      .select()
      .single();

    if (updateError || !fresh) {
      console.error("[NotificationsPrompt] profile update failed:", updateError);
      Alert.alert(
        "Couldn't save settings",
        "Check your connection and try again.",
        [{ text: "OK" }]
      );
      return;
    }

    setNotificationEnabled(params.enabled);
    setNotificationTime(notifHour, notifMinute);

    setProfile(fresh as Profile);
    applyNotificationTimeFromProfile(fresh.notification_time);
    applyThemeFromProfile((fresh as Profile).color_theme, fresh as Profile);

    try {
      await syncPushRegistration({
        notificationsEnabled: params.enabled,
        reminderHour: notifHour,
        reminderMinute: notifMinute,
        reflectionTargetDefault: reflectionTarget,
        captureRhythm: rhythm,
      });
    } catch (err) {
      console.error("[NotificationsPrompt] syncPushRegistration failed:", err);
    }

    posthog.capture("reflection_target_set", {
      ...onboardingEventProps(6),
      capture_rhythm: rhythm,
      reflection_target_default: reflectionTarget,
    });

    if (params.enabled) {
      posthog.capture(
        "notifications_enabled",
        onboardingEventProps(6, {
          rhythm,
          reflection_target: reflectionTarget,
        })
      );
    } else {
      posthog.capture(
        "notifications_skipped",
        onboardingEventProps(6, {
          rhythm,
          reason: params.reason ?? "user_skipped",
        })
      );
    }

    posthog.capture(
      "onboarding_notifications_completed",
      onboardingEventProps(6, {
        notifications_enabled: params.enabled,
        rhythm,
        reflection_target: reflectionTarget,
      })
    );

    if (params.enabled) {
      // Fire ~2 min after permission grant (so it doesn't pop OVER the
      // paywall the user is staring at), and key the copy off whether
      // they already captured during onboarding (activation flags on
      // the freshly-updated profile).
      const hasCapturedToday = Boolean(
        (fresh as Profile).activation_photo_completed ||
          (fresh as Profile).activation_word_completed
      );
      void scheduleWelcomeFirstCaptureNotification({ hasCapturedToday });
    }

    goToNextStep();
  };

  const handleTurnOn = async () => {
    if (busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const granted = await requestNotificationPermissions();
      await finishOnboarding({
        enabled: granted,
        reason: granted ? undefined : "os_denied",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSkipNotifications = async () => {
    if (busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await finishOnboarding({ enabled: false, reason: "user_skipped" });
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectedBg = "#FEEEB1";
  const toggleSelectedFg = "#000000";
  const toggleSelectedBorder = "rgba(0,0,0,0.14)";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 120,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginTop: 4 }}>
          <Text
            style={{
              fontFamily: "PMGothicLudington-Text110",
              fontSize: 26,
              lineHeight: 32,
              color: colors.text,
              textAlign: "center",
            }}
          >
            {quizSeededRhythm
              ? "Confirm when we should nudge you"
              : "When do you want to capture your moment?"}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 24 }}>
          {(
            [
              {
                id: "morning" as const,
                label: "Morning",
                sub: "around 8:00 am",
                icon: "sunny-outline" as const,
              },
              {
                id: "evening" as const,
                label: "Evening",
                sub: "around 9:00 pm",
                icon: "moon-outline" as const,
              },
            ] as const
          ).map((opt) => {
            const selected = rhythm === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setRhythm(opt.id);
                  posthog.capture(
                    "onboarding_capture_rhythm_selected",
                    onboardingEventProps(6, { rhythm: opt.id })
                  );
                }}
                style={{
                  flex: 1,
                  paddingVertical: 16,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  backgroundColor: selected
                    ? toggleSelectedBg
                    : "transparent",
                  borderWidth: 1.5,
                  borderColor: selected ? toggleSelectedBorder : colors.border,
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Ionicons
                  name={opt.icon}
                  size={26}
                  color={selected ? toggleSelectedFg : colors.textSecondary}
                />
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 16,
                    color: selected ? toggleSelectedFg : colors.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Roboto-Regular",
                    fontSize: 12,
                    color: selected ? toggleSelectedFg : colors.textMuted,
                  }}
                >
                  {opt.sub}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            marginTop: 20,
            padding: 16,
            borderRadius: 16,
            backgroundColor: colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: colors.borderLight,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Image
              source={APP_ICON}
              style={{ width: 22, height: 22, borderRadius: 6 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text
              style={{
                fontFamily: "Roboto-Medium",
                fontSize: 11,
                letterSpacing: 0.8,
                color: colors.textMuted,
              }}
            >
              WHAT WE&apos;LL ASK ABOUT
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              marginTop: 14,
            }}
          >
            {(
              [
                { id: "yesterday" as const, label: "Yesterday" },
                { id: "today" as const, label: "Today" },
              ] as const
            ).map((opt) => {
              const selected = reflectionTarget === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setReflectionTarget(opt.id);
                    posthog.capture(
                      "onboarding_reflection_target_selected",
                      onboardingEventProps(6, { reflection_target: opt.id })
                    );
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: selected ? toggleSelectedBg : "transparent",
                    borderWidth: 1.5,
                    borderColor: selected ? toggleSelectedBorder : colors.border,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Roboto-Medium",
                      fontSize: 13,
                      color: selected ? toggleSelectedFg : colors.textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            setTimeModalOpen(true);
          }}
          style={{
            marginTop: 22,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontFamily: "Roboto-Regular", fontSize: 15, color: colors.text }}>
            Notify me at
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: "Roboto-Medium", fontSize: 15, color: colors.text }}>
              {timeLabel}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          </View>
        </Pressable>

        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 12,
            color: colors.textMuted,
            marginTop: 10,
          }}
        >
          You can fine-tune reminders later in Settings.
        </Text>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: 28,
          paddingTop: 12,
          gap: 12,
          backgroundColor: colors.background,
        }}
      >
        <Pressable
          accessibilityLabel="Turn on nudges"
          onPress={() => void handleTurnOn()}
          disabled={busy}
          style={{
            height: 56,
            borderRadius: 9999,
            backgroundColor: colors.primary,
            borderWidth: 2,
            borderColor: PINK_CTA_BORDER,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 0.6 : 1,
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
            Turn on nudges
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Skip notifications"
          onPress={() => void handleSkipNotifications()}
          disabled={busy}
          style={{ paddingVertical: 8, opacity: busy ? 0.6 : 1 }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textMuted,
              textAlign: "center",
              textDecorationLine: "underline",
            }}
          >
            Skip notifications
          </Text>
        </Pressable>
      </View>

      <Modal visible={timeModalOpen} animationType="fade" transparent>
        <Pressable
          onPress={() => setTimeModalOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              borderRadius: 16,
              backgroundColor: colors.surface,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "PMGothicLudington-Text110",
                fontSize: 18,
                color: colors.text,
                marginBottom: 16,
              }}
            >
              Reminder time
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 24 }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                  Hour
                </Text>
                <Pressable
                  onPress={() =>
                    setNotifHour((h) => (h + 1) % 24)
                  }
                >
                  <Ionicons name="chevron-up" size={28} color={colors.text} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 22,
                    color: colors.text,
                    marginVertical: 8,
                  }}
                >
                  {notifHour}
                </Text>
                <Pressable
                  onPress={() =>
                    setNotifHour((h) => (h + 23) % 24)
                  }
                >
                  <Ionicons name="chevron-down" size={28} color={colors.text} />
                </Pressable>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6 }}>
                  Minute
                </Text>
                <Pressable
                  onPress={() =>
                    setNotifMinute((m) => {
                      const n = m + 15;
                      return n >= 60 ? 0 : n;
                    })
                  }
                >
                  <Ionicons name="chevron-up" size={28} color={colors.text} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: "Roboto-Medium",
                    fontSize: 22,
                    color: colors.text,
                    marginVertical: 8,
                  }}
                >
                  {String(notifMinute).padStart(2, "0")}
                </Text>
                <Pressable
                  onPress={() =>
                    setNotifMinute((m) => {
                      const n = m - 15;
                      return n < 0 ? 45 : n;
                    })
                  }
                >
                  <Ionicons name="chevron-down" size={28} color={colors.text} />
                </Pressable>
              </View>
            </View>
            <Pressable
              onPress={() => setTimeModalOpen(false)}
              style={{
                marginTop: 20,
                paddingVertical: 12,
                borderRadius: 999,
                backgroundColor: toggleSelectedBg,
                borderWidth: 1.5,
                borderColor: toggleSelectedBorder,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Roboto-Medium",
                  color: toggleSelectedFg,
                }}
              >
                Done
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
