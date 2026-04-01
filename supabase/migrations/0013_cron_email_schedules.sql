-- Schedule cron-onboarding-emails every hour and cron-trial-expiring every hour.
--
-- Prereqs (same as 0006):
--   1) pg_cron and pg_net extensions enabled.
--   2) CRON_SECRET stored in Vault as cron_evening_pushes_secret.
--
-- If your project ref is not smwmkeoljqnifaoqzemb, edit the URLs below.

-- ------------------------------------------------------------------
-- cron-onboarding-emails  (hourly)
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-onboarding-emails'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-onboarding-emails',
  '0 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-onboarding-emails',
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
-- cron-trial-expiring  (hourly)
-- ------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-trial-expiring'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-trial-expiring',
  '0 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-trial-expiring',
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
