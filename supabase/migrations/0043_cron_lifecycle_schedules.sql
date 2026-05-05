-- ============================================================
-- LIFECYCLE MESSAGING SCHEDULES
--
-- Schedules the new behavior-triggered crons that replace / complement
-- the legacy time-based onboarding drip:
--
--   1. cron-lifecycle-emails   — hourly trigger-checker (replaces
--                                cron-onboarding-emails)
--   2. cron-on-this-day        — every 15 min (window logic inside)
--
-- The legacy `cron-onboarding-emails` schedule from 0040 already
-- unscheduled the time-based drip; we leave that function in place
-- as a no-op for safety but stop scheduling it.
-- ============================================================

-- Make sure the legacy onboarding-email cron is unscheduled — defensive
-- in case it was re-added between 0040 and now.
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-onboarding-emails'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

-- ------------------------------------------------------------------
-- cron-lifecycle-emails — hourly behavior-triggered email checker
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-lifecycle-emails'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-lifecycle-emails',
  '17 * * * *', -- 17 minutes past the hour, off the busy zero-minute bucket
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-lifecycle-emails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || coalesce(
        (select decrypted_secret
         from vault.decrypted_secrets
         where name = 'cron_evening_pushes_secret'
         limit 1),
        ''
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $invoke$
);

-- ------------------------------------------------------------------
-- cron-on-this-day — every 15 min (per-user window logic inside)
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-on-this-day'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-on-this-day',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-on-this-day',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || coalesce(
        (select decrypted_secret
         from vault.decrypted_secrets
         where name = 'cron_evening_pushes_secret'
         limit 1),
        ''
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $invoke$
);
