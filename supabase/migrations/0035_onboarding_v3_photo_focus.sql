-- ============================================================
-- ONBOARDING V3 — PHOTO FOCUS
-- Collapses the v2 multi-phase flow into:
--   photo_permission -> activation -> reveal -> notifications -> done
--
-- Adds the two new phase values (photo_permission, reveal) and
-- changes the default for new profiles to land directly on
-- `photo_permission` instead of `resonance`.
--
-- Legacy phase values are kept in the CHECK constraint so any
-- in-flight v2 users don't fail saves; routeAfterAuth() bridges
-- those phases to the closest v3 step on the client.
-- ============================================================

-- 1. Expand the onboarding_phase CHECK constraint to include v3 phases
alter table public.profiles
  drop constraint if exists profiles_onboarding_phase_check;

alter table public.profiles
  add constraint profiles_onboarding_phase_check
    check (onboarding_phase in (
      -- v3 photo-focus
      'photo_permission',
      'activation',
      'reveal',
      'notifications',
      'done',

      -- legacy v2 (kept valid for in-flight users; bridged on the client)
      'resonance',
      'follow_up',
      'slides',
      'donation',
      'trial',
      'story_coach',
      'personalized'
    ));

-- 2. New profiles default to the v3 entry phase
alter table public.profiles
  alter column onboarding_phase set default 'photo_permission';
