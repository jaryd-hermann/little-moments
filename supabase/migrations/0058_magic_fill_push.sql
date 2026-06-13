-- Magic Fill push nudge eligibility (synced from client + updated by cron).

alter table public.profiles
  add column if not exists has_completed_magic_fill boolean not null default false,
  add column if not exists magic_fill_started_at timestamptz,
  add column if not exists last_magic_fill_nudge_at timestamptz,
  add column if not exists magic_fill_nudge_count integer not null default 0;

comment on column public.profiles.has_completed_magic_fill is
  'True after the user completes at least one Magic Fill batch save.';
comment on column public.profiles.magic_fill_started_at is
  'Set when the user opens the Magic Fill wizard (stops push nudges).';
comment on column public.profiles.last_magic_fill_nudge_at is
  'Timestamp of the most recent Magic Fill promotional push.';
comment on column public.profiles.magic_fill_nudge_count is
  'Lifetime Magic Fill nudge sends (cap: 3).';
