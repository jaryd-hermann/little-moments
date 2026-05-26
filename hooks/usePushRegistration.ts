import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";
import { syncPushRegistration } from "@/lib/pushRegistration";

/** Keeps Expo push token + timezone in sync; falls back to local daily reminder when no token. */
export function usePushRegistration() {
  const user = useAuthStore((s) => s.user);
  const reflectionTargetDefault = useAuthStore(
    (s) => s.profile?.reflection_target_default
  );
  const captureRhythm = useAuthStore((s) => s.profile?.capture_rhythm);
  const notificationEnabled = useSettingsStore((s) => s.notificationEnabled);
  const notificationTime = useSettingsStore((s) => s.notificationTime);

  useEffect(() => {
    if (!user) return;
    void syncPushRegistration({
      notificationsEnabled: notificationEnabled,
      reminderHour: notificationTime.hour,
      reminderMinute: notificationTime.minute,
      reflectionTargetDefault: reflectionTargetDefault ?? undefined,
      captureRhythm:
        captureRhythm === "morning" || captureRhythm === "evening"
          ? captureRhythm
          : undefined,
    });
  }, [
    user?.id,
    notificationEnabled,
    notificationTime.hour,
    notificationTime.minute,
    reflectionTargetDefault,
    captureRhythm,
  ]);
}
