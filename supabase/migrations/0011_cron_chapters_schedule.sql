-- Schedule cron-chapters every 15 minutes (1st of month, 6am local logic inside the function).
--
-- Prereqs (same as 0006):
--   1) pg_cron and pg_net extensions enabled.
--   2) CRON_SECRET stored in Vault (reuses same secret as cron-evening-pushes).
--
-- If your project ref is not smwmkeoljqnifaoqzemb, edit the URL below.

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-chapters'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-chapters',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-chapters',
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
