import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  color_theme: "light" | "dark" | "system";
  notification_enabled: boolean;
  notification_time: string;
  streak_at_risk_enabled: boolean;
  trial_start_date: string | null;
  subscription_status: "free" | "trial" | "active" | "expired" | "cancelled";
  revenuecat_customer_id: string | null;
  streak_count: number;
  longest_streak: number;
  last_entry_date: string | null;
  total_moments: number;
  onboarding_completed: boolean;
  onboarding_phase?:
    // photo-focus v3 + quiz v1 phases
    | "quiz"
    | "onboarding_welcome"
    | "photo_permission"
    | "activation"
    | "reveal"
    | "notifications"
    | "done"
    // legacy v2 phases (still valid in DB until in-flight users finish)
    | "resonance"
    | "follow_up"
    | "slides"
    | "donation"
    | "trial"
    | "story_coach"
    | "personalized"
    | null;
  /**
   * Raw pre-auth quiz answers ({ [questionId]: optionId }). Populated by
   * `onboardingQuizStore.flushToProfile` right after sign-in succeeds.
   */
  quiz_answers?: Record<string, string> | null;
  /** Derived persona tag from Q1 of the onboarding quiz. */
  quiz_persona?: string | null;
  resonance_option_ids?: string[] | null;
  donation_cause_id?: string | null;
  follow_up_screen_key?: string | null;
  story_coach_enabled?: boolean;
  activation_word_completed?: boolean;
  activation_photo_completed?: boolean;
  /** Closing activation: yes | kind_of | no — did Ellie explain LM clearly */
  activation_lm_understanding?: "yes" | "kind_of" | "no" | null;
  notification_timezone?: string | null;
  /** Morning vs evening — set during onboarding "When?" step. */
  capture_rhythm?: "morning" | "evening" | null;
  /** Default day chip: reflect on yesterday vs today (user can change per capture). */
  reflection_target_default?: "yesterday" | "today" | null;
  /** Local YYYY-MM-DD: last midday “snap a pic” nudge sent (server cron). */
  last_midday_photo_nudge_local_date?: string | null;
  has_completed_magic_fill?: boolean;
  magic_fill_started_at?: string | null;
  last_magic_fill_nudge_at?: string | null;
  magic_fill_nudge_count?: number;
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
