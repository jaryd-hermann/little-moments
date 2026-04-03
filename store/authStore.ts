import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  color_theme: "light" | "dark";
  notification_enabled: boolean;
  notification_time: string;
  streak_at_risk_enabled: boolean;
  trial_start_date: string | null;
  subscription_status: "trial" | "active" | "expired" | "cancelled";
  revenuecat_customer_id: string | null;
  streak_count: number;
  longest_streak: number;
  last_entry_date: string | null;
  total_moments: number;
  onboarding_completed: boolean;
  onboarding_phase?:
    | "resonance"
    | "follow_up"
    | "slides"
    | "donation"
    | "trial"
    | "notifications"
    | "story_coach"
    | "done"
    | null;
  resonance_option_ids?: string[] | null;
  donation_cause_id?: string | null;
  follow_up_screen_key?: string | null;
  story_coach_enabled?: boolean;
  notification_timezone?: string | null;
  badge_push_state?: Record<string, boolean> | null;
  last_daily_push_local_date?: string | null;
  last_streak_risk_push_local_date?: string | null;
  created_at: string;
  updated_at: string;
}

interface AuthStore {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setSession: (session: Session | null) => void;
  setIsLoading: (loading: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  session: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setSession: (session) => set({ session }),
  setIsLoading: (isLoading) => set({ isLoading }),
  clearAuth: () => set({ user: null, profile: null, session: null }),
}));
