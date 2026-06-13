import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useSettingsStore } from "@/store/settingsStore";

/** Mark Magic Fill wizard opened — stops promotional push nudges. */
export async function syncMagicFillStartedToProfile(): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  const profile = useAuthStore.getState().profile;
  if (!userId || profile?.magic_fill_started_at) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ magic_fill_started_at: now })
    .eq("id", userId);

  if (!error && profile) {
    useAuthStore.getState().setProfile({
      ...profile,
      magic_fill_started_at: now,
    });
  }
}

/** Persist Magic Fill completion for push eligibility + server analytics. */
export async function syncMagicFillCompletedToProfile(): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  const profile = useAuthStore.getState().profile;
  if (!userId) return;

  const { error } = await supabase
    .from("profiles")
    .update({ has_completed_magic_fill: true })
    .eq("id", userId);

  if (!error && profile) {
    useAuthStore.getState().setProfile({
      ...profile,
      has_completed_magic_fill: true,
    });
  }
}

/** Push local completion flag to profile after offline saves or reinstall. */
export async function syncLocalMagicFillFlagsToProfile(): Promise<void> {
  const hasCompleted = useSettingsStore.getState().hasCompletedMagicFill;
  if (!hasCompleted) return;
  await syncMagicFillCompletedToProfile();
}
