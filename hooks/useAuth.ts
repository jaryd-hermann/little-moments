import { useCallback } from "react";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore, type Profile } from "@/store/authStore";
import { logOutRevenueCat } from "@/lib/revenuecat";

export function useAuth() {
  const { user, profile, session, isLoading, setProfile, clearAuth } =
    useAuthStore();

  const fetchProfile = useCallback(async () => {
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (data) {
      setProfile(data as Profile);
    }
    return data as Profile | null;
  }, [user]);

  const signOut = useCallback(async () => {
    await logOutRevenueCat();
    await supabase.auth.signOut();
    clearAuth();
    router.replace("/splash");
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!user) return;
    await supabase.from("entries").delete().eq("user_id", user.id);
    await supabase.from("entry_media").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);
    await logOutRevenueCat();
    await supabase.auth.signOut();
    clearAuth();
    router.replace("/splash");
  }, [user]);

  return {
    user,
    profile,
    session,
    isLoading,
    fetchProfile,
    signOut,
    deleteAccount,
  };
}
