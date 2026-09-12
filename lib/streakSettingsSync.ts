import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";

/** Hydrate local streak preference from the profile row (server is source of truth). */
export function applyStreaksEnabledFromProfile(
  profile: { streak_at_risk_enabled?: boolean | null } | null | undefined,
): void {
  if (profile == null) return;
  const enabled = profile.streak_at_risk_enabled !== false;
  const current = useSettingsStore.getState().streaksEnabled;
  if (current === enabled) return;
  useSettingsStore.getState().setStreaksEnabled(enabled);
}

/** Persist streak preference so evening crons + lifecycle-event respect it. */
export async function syncStreaksEnabledToProfile(
  enabled: boolean,
): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  const profile = useAuthStore.getState().profile;
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({ streak_at_risk_enabled: enabled })
    .eq("id", userId);

  if (!error && profile) {
    useAuthStore.getState().setProfile({
      ...profile,
      streak_at_risk_enabled: enabled,
    });
  }
}
