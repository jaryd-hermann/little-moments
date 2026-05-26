-- ============================================================
-- ONBOARDING QUIZ
--   • Adds quiz_answers (jsonb) and quiz_persona (text) on profiles
--   • Inserts a new 'quiz' phase into the onboarding_phase CHECK
--     constraint (kept before 'onboarding_welcome' in the funnel)
--   • Flips the default onboarding_phase to 'quiz' so the auth
--     `handle_new_user` trigger lands new profiles there. Existing
--     in-flight users keep their current phase; the client-side
--     bridge in lib/onboardingRoute.ts handles legacy values.
-- ============================================================

alter table public.profiles
  add column if not exists quiz_answers jsonb not null default '{}'::jsonb,
  add column if not exists quiz_persona text;

comment on column public.profiles.quiz_answers is
  'Pre-auth onboarding quiz answers, flushed from the client AsyncStorage stash after sign-in. Shape: { [questionId: string]: optionId: string }.';
comment on column public.profiles.quiz_persona is
  'Derived persona tag (time | memory | legacy | habit | presence) from Q1 of the onboarding quiz; used for downstream personalization.';

alter table public.profiles
  drop constraint if exists profiles_onboarding_phase_check;

alter table public.profiles
  add constraint profiles_onboarding_phase_check
    check (onboarding_phase in (
      'quiz',
      'onboarding_welcome',
      'photo_permission',
      'activation',
      'reveal',
      'notifications',
      'done',
      'resonance',
      'follow_up',
      'slides',
      'donation',
      'trial',
      'story_coach',
      'personalized'
    ));

alter table public.profiles
  alter column onboarding_phase set default 'quiz';
