-- Capture rhythm (morning/evening) and default reflection target (yesterday/today).
-- Used by day-scoped curator capture and the combined onboarding "When?" step.

alter table public.profiles
  add column if not exists capture_rhythm text
    check (capture_rhythm is null or capture_rhythm in ('morning', 'evening'));

alter table public.profiles
  add column if not exists reflection_target_default text
    check (
      reflection_target_default is null
      or reflection_target_default in ('yesterday', 'today')
    );

comment on column public.profiles.capture_rhythm is
  'User preference: morning vs evening capture nudge; pairs with reflection_target_default.';

comment on column public.profiles.reflection_target_default is
  'Default calendar day for reflection relative to open: yesterday vs today (user can override per session).';
