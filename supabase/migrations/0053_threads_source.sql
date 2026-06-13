-- ============================================================
-- Add `source` column to threads so we can tell apart threads
-- created in real-time from a user save (process-threads) and
-- threads created by the nightly batch (cron-threads-nightly).
--
-- This is consumed by cron-threads-nightly to enforce a
-- 4-per-rolling-7-day cap on cron-created threads per user.
-- Real-time threads (1 per save, already naturally capped) are
-- not counted against the weekly limit.
--
-- Existing rows default to 'realtime'. We intentionally do not
-- backfill historical cron rows: the weekly cap is forward
-- looking and will be enforced as soon as cron starts writing
-- 'cron' on new inserts.
-- ============================================================

alter table public.threads
  add column if not exists source text not null default 'realtime'
    check (source in ('realtime', 'cron'));

-- Backs the cron's weekly-cap query:
--   select count(*) from threads
--    where user_id = $1
--      and source = 'cron'
--      and created_at > now() - interval '7 days';
create index if not exists threads_user_cron_created_idx
  on public.threads (user_id, created_at desc)
  where source = 'cron';
