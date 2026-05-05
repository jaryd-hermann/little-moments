-- ============================================================
-- Track the last local Monday on which we sent the "New week. New chapter"
-- weekly chapter intro push (delivered via OneSignal at lunch time local).
-- Mirrors the existing last_morning_push_local_date / last_followup_push_local_date /
-- last_chapter_push_local_date pattern so a single user can only receive one
-- intro push per Monday even if the cron tick happens to overlap the firing
-- window twice (timezone DST shifts, retries, etc.).
-- ============================================================

alter table public.profiles
  add column if not exists last_weekly_chapter_intro_local_date date;
