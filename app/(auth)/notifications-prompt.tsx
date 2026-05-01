import { View, Text, Pressable, Image } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import * as Haptics from "expo-haptics";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/store/authStore";
import { requestNotificationPermissions } from "@/lib/notifications";
import { syncPushRegistration } from "@/lib/pushRegistration";
import { useSettingsStore } from "@/store/settingsStore";
import { NotificationTimePicker } from "@/components/settings/NotificationTimePicker";

const BG = "#FFFFFF";
const INK = "#000000";
const SUBTEXT = "rgba(0, 0, 0, 0.58)";
const BENEFIT_MUTED = "rgba(0, 0, 0, 0.45)";
const CTA_VIOLET = "#f0d7ff";

const HERO = require("@/assets/images/notification.png");

// Onboarding screen forces light theme tokens; pass a minimal palette
// to the shared NotificationTimePicker.
const PICKER_PALETTE = {
  text: "#1A1A1A",
  textSecondary: "rgba(0, 0, 0, 0.6)",
  textMuted: "rgba(0, 0, 0, 0.4)",
  surface: "#FFFFFF",
  surfaceSecondary: "#F5F5E4",
  border: "rgba(0, 0, 0, 0.15)",
  primary: "#f0d7ff",
};

export default function NotificationsPromptScreen() {
  const user = useAuthStore((s) => s.user);
  const setProfile = useAuthStore((s) => s.setProfile);
  const setNotificationEnabled = useSettingsStore(
    (s) => s.setNotificationEnabled
  );
  const notificationTime = useSettingsStore((s) => s.notificationTime);
  const setNotificationTime = useSettingsStore((s) => s.setNotificationTime);

  const finishOnboarding = async (enabled: boolean) => {
    if (!user) return;
    setNotificationEnabled(enabled);
    await supabase
      .from("profiles")
      .update({
        notification_enabled: enabled,
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
    if (fresh) setProfile(fresh as Profile);

    if (enabled) {
      await syncPushRegistration({
        notificationsEnabled: true,
        reminderHour: notificationTime.hour,
        reminderMinute: notificationTime.minute,
      });
    }

    router.replace("/(tabs)/capture");
  };

  const onAllow = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const granted = await requestNotificationPermissions();
    await finishOnboarding(granted);
  };

  const onLater = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await finishOnboarding(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24 }}>
        <Text
          style={{
            fontFamily: "LibreBaskerville-Bold",
            fontSize: 28,
            color: INK,
            textAlign: "center",
          }}
        >
          Allow notifications
        </Text>
        <Text
          style={{
            fontFamily: "Roboto-Light",
            fontSize: 15,
            color: SUBTEXT,
            textAlign: "center",
            marginTop: 10,
          }}
        >
          Remember, you can opt out anytime.
        </Text>

        <View style={{ alignItems: "center", marginTop: 28 }}>
          <Image
            source={HERO}
            style={{ width: 260, height: 260, resizeMode: "contain" }}
          />
        </View>

        <View style={{ marginTop: 24, gap: 14 }}>
          <BenefitRow
            icon="bulb-outline"
            text="Learn tips that help you capture moments faster"
          />
          <BenefitRow
            icon="time-outline"
            text="Receive a gentle daily reminder at a time you choose"
          />
        </View>

        <View style={{ marginTop: 22 }}>
          <Text
            style={{
              fontFamily: "Roboto-Regular",
              fontSize: 13,
              color: INK,
              marginBottom: 10,
            }}
          >
            When should we nudge you?
          </Text>
          <NotificationTimePicker
            value={notificationTime}
            onChange={(h, m) => setNotificationTime(h, m)}
            colors={PICKER_PALETTE}
          />
        </View>
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: 32, gap: 14 }}>
        <Pressable
          onPress={onAllow}
          style={{
            height: 52,
            borderRadius: 9999,
            backgroundColor: CTA_VIOLET,
            borderWidth: 2,
            borderColor: INK,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: INK,
            }}
          >
            Allow notifications
          </Text>
        </Pressable>
        <Pressable onPress={onLater} style={{ paddingVertical: 12 }}>
          <Text
            style={{
              fontFamily: "Roboto-Medium",
              fontSize: 15,
              color: BENEFIT_MUTED,
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

type IonName = ComponentProps<typeof Ionicons>["name"];

function BenefitRow({ icon, text }: { icon: IonName; text: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Ionicons name={icon} size={22} color={BENEFIT_MUTED} />
      <Text
        style={{
          flex: 1,
          fontFamily: "Roboto-Regular",
          fontSize: 15,
          lineHeight: 22,
          color: INK,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
