-- What the user most wants to remember, asked at the end of the first-moment
-- onboarding chat. Null covers both "not asked yet" and "skipped".
alter table public.profiles
  add column if not exists remember_most text;

alter table public.profiles
  drop constraint if exists profiles_remember_most_check;

alter table public.profiles
  add constraint profiles_remember_most_check
  check (
    remember_most is null
    or remember_most in (
      'everyday_life',
      'kids_growing_up',
      'travels_adventures',
      'something_else'
    )
  );

comment on column public.profiles.remember_most is
  'Onboarding chat close: what the user most wants to remember (everyday_life | kids_growing_up | travels_adventures | something_else). Null if skipped or never asked.';
