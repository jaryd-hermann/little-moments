import { useEffect, useState } from "react";
import { View, Text, Pressable, Image, StatusBar } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { usePostHog } from "posthog-react-native";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { useTheme } from "@/hooks/useTheme";
import { bevelShadow, PINK_CTA_BORDER, PINK_CTA_INK } from "@/lib/themedShadow";
import {
  fireMomentSavedNotification,
  requestNotificationPermissions,
} from "@/lib/notifications";
import { syncPushRegistration } from "@/lib/pushRegistration";
import { useSettingsStore } from "@/store/settingsStore";
import { applyNotificationTimeFromProfile } from "@/lib/notificationTimeSync";
import { applyThemeFromProfile } from "@/lib/themeSync";
import { onboardingEventProps } from "@/lib/onboardingEvents";
import { consumeActivationPhotoUri } from "@/lib/onboardingHandoff";
import { useEntryStore } from "@/store/entryStore";

const PUSH_MOCK_IMAGE = require("@/assets/images/push-mock.png");

type Slot = "morning" | "afternoon" | "evening";

const SLOTS: { id: Slot; label: string; hour: number; minute: number }[] = [
  { id: "morning", label: "Morning", hour: 9, minute: 0 },
  { id: "afternoon", label: "Afternoon", hour: 13, minute: 0 },
  { id: "evening", label: "Evening", hour: 19, minute: 0 },
];

export default function NotificationsPromptScreen() {
  const { colors, theme } = useTheme();
  const posthog = usePostHog();
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setNotificationEnabled = useSettingsStore(
    (s) => s.setNotificationEnabled
  );
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);

  const [selectedSlot, setSelectedSlot] = useState<Slot>("morning");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    posthog.capture("viewed_notifications", onboardingEventProps(6));
  }, []);

  const finishOnboarding = async (params: {
    enabled: boolean;
    reason?: "user_skipped" | "os_denied";
  }) => {
    if (!user) return;
    const slot = SLOTS.find((s) => s.id === selectedSlot)!;
    setNotificationEnabled(params.enabled);
    setNotificationTime(slot.hour, slot.minute);

    try {
      await syncPushRegistration({
        notificationsEnabled: params.enabled,
        reminderHour: slot.hour,
        reminderMinute: slot.minute,
      });
    } catch (err) {
      console.error("[NotificationsPrompt] syncPushRegistration failed:", err);
    }

    await supabase
      .from("profiles")
      .update({
        notification_enabled: params.enabled,
        onboarding_phase: "done",
        onboarding_completed: true,
        story_coach_enabled: true,
      })
      .eq("id", user.id);

    const { data: fresh } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (fresh) {
      setProfile(fresh as Profile);
      applyNotificationTimeFromProfile(fresh.notification_time);
      applyThemeFromProfile((fresh as Profile).color_theme, fresh as Profile);
    }

    if (params.enabled) {
      posthog.capture(
        "notifications_enabled",
        onboardingEventProps(6, { slot: selectedSlot })
      );
    } else {
      posthog.capture(
        "notifications_skipped",
        onboardingEventProps(6, {
          slot: selectedSlot,
          reason: params.reason ?? "user_skipped",
        })
      );
    }

    posthog.capture(
      "activation_completed",
      onboardingEventProps(6, {
        notifications_enabled: params.enabled,
        slot: selectedSlot,
      })
    );

    // First-moment celebration push. The activation save fired *before* the
    // user had granted notifications permission (and before any push token
    // existed), so `fireMomentSavedNotification` was skipped at that point.
    // Now that permission is granted + the token is registered, replay it
    // here so the reinforcing "You captured your 1st moment" banner lands
    // in the OS notification center before we route into the app.
    //
    // We read the ordinal from the entry store (already hydrated by the
    // activation save) to stay robust to any edge case where the user had
    // more than one moment before landing here.
    if (params.enabled) {
      const totalMoments = useEntryStore
        .getState()
        .entries.filter((e) => e.entry_type === "moment").length;
      const attachedPhotoUri = consumeActivationPhotoUri();
      void fireMomentSavedNotification({
        totalMoments: Math.max(1, totalMoments),
        attachedPhotoUri,
      });
    }

    router.replace("/(tabs)/today");
  };

  const handleSelectSlot = (slot: Slot) => {
    if (slot === selectedSlot) return;
    void Haptics.selectionAsync();
    setSelectedSlot(slot);
    posthog.capture(
      "notifications_time_slot_selected",
      onboardingEventProps(6, { slot })
    );
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

  const handleLater = async () => {
    if (busy) return;
    setBusy(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await finishOnboarding({ enabled: false, reason: "user_skipped" });
    } finally {
      setBusy(false);
    }
  };

  // Notification mock card always renders on a light "iOS notification" surface
  // so it reads as a real OS toast regardless of app theme.
  const NOTIF_SURFACE = "rgba(255,255,255,0.95)";
  const NOTIF_INK = "#1A1A1A";
  const NOTIF_SUB = "rgba(0,0,0,0.58)";
  const NOTIF_MUTED = "rgba(0,0,0,0.45)";

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top"]}
    >
      <StatusBar
        barStyle={theme === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          paddingTop: 24,
        }}
      >
        <NotificationPreviewCard
          surface={NOTIF_SURFACE}
          ink={NOTIF_INK}
          sub={NOTIF_SUB}
          muted={NOTIF_MUTED}
        />

        <View style={{ marginTop: 32 }}>
          <Text
            style={{
              fontFamily: "LibreBaskerville-Bold",
              fontSize: 26,
              lineHeight: 32,
              color: colors.text,
              textAlign: "center",
            }}
          >
            Get a daily nudge
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              lineHeight: 22,
              color: colors.textSecondary,
              textAlign: "center",
              marginTop: 8,
              paddingHorizontal: 12,
            }}
          >
            We&apos;ll remind you once a day to capture your moment. When
            works best for you?
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 24,
          }}
        >
          {SLOTS.map((s) => {
            const selected = s.id === selectedSlot;
            return (
              <Pressable
                key={s.id}
                accessibilityLabel={s.label}
                onPress={() => handleSelectSlot(s.id)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 9999,
                  backgroundColor: selected ? colors.primary : "transparent",
                  borderWidth: 1.5,
                  borderColor: selected ? PINK_CTA_BORDER : colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: selected ? "Roboto-Medium" : "Roboto-Regular",
                    fontSize: 14,
                    color: selected ? PINK_CTA_INK : colors.textSecondary,
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 12,
            lineHeight: 18,
            color: colors.textMuted,
            textAlign: "center",
            marginTop: 12,
          }}
        >
          You can edit exact times later in settings
        </Text>
      </View>

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
          accessibilityLabel="Turn on notifications"
          onPress={handleTurnOn}
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
            Turn on notifications
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Maybe later"
          onPress={handleLater}
          disabled={busy}
          style={{ paddingVertical: 8, opacity: busy ? 0.6 : 1 }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 14,
              color: colors.textMuted,
              textAlign: "center",
            }}
          >
            Maybe later
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function NotificationPreviewCard({
  surface,
  ink,
  sub,
  muted,
}: {
  surface: string;
  ink: string;
  sub: string;
  muted: string;
}) {
  return (
    <View
      style={{
        backgroundColor: surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.10)",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 2,
      }}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 13,
              color: ink,
              letterSpacing: 0.2,
            }}
          >
            Little Moments
          </Text>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 11,
              color: muted,
            }}
          >
            now
          </Text>
        </View>
        <Text
          style={{
            fontFamily: "Roboto-Medium",
            fontSize: 14,
            color: ink,
            marginTop: 2,
          }}
        >
          Today&apos;s photo is ready
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Regular",
            fontSize: 13,
            lineHeight: 18,
            color: sub,
            marginTop: 2,
          }}
          numberOfLines={2}
        >
          See which one it is, and add your moment in 30s.
        </Text>
      </View>
      <Image
        source={PUSH_MOCK_IMAGE}
        style={{ width: 56, height: 56 }}
        resizeMode="contain"
        accessibilityLabel="Notification photo preview"
      />
    </View>
  );
}
