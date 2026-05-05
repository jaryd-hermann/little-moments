-- ============================================================
-- Track whether the 3-hour follow-up push has fired for the user
-- on a given local calendar day, mirroring the existing
-- last_morning_push_local_date / last_daily_push_local_date pattern.
-- ============================================================

alter table public.profiles
  add column if not exists last_followup_push_local_date date;
