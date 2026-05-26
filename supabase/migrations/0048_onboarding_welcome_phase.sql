-- Full-bleed welcome (2.png) step after sign-in, before photo permission.
-- New profiles land here first; existing in-flight users stay on their current phase.

alter table public.profiles
  drop constraint if exists profiles_onboarding_phase_check;

alter table public.profiles
  add constraint profiles_onboarding_phase_check
    check (onboarding_phase in (
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
  alter column onboarding_phase set default 'onboarding_welcome';
