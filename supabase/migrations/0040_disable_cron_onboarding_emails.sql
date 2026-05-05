-- Disable the days 1–10 onboarding email drip.
--
-- The drip is being shifted off our infra (sent from a separate system),
-- so we no longer need pg_cron to invoke `cron-onboarding-emails`. The
-- edge function itself is also hard no-op'd (see
-- supabase/functions/cron-onboarding-emails/index.ts) as belt-and-braces
-- in case this migration is rolled back without the function change.
--
-- We do NOT touch the `cron-trial-expiring` job from migration 0013 —
-- trials are still on our infra. We also leave the function URL,
-- email_sends rows, and onboarding email templates in place so the work
-- is reversible without a code archaeology dig.
--
-- To re-enable: re-create the schedule with the same body as in 0013.

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-onboarding-emails'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;
