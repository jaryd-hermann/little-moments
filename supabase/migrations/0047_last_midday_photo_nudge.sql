-- Stamp for midday “snap a pic” nudge (local calendar date in user TZ), one per day max.
alter table public.profiles
  add column if not exists last_midday_photo_nudge_local_date text;

comment on column public.profiles.last_midday_photo_nudge_local_date is
  'YYYY-MM-DD in user local TZ; set after midday camera nudge send to avoid duplicates.';
