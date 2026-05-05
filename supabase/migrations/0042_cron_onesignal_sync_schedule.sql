-- Schedule cron-onesignal-sync hourly. Keeps OneSignal tags fresh for
-- users who haven't opened the app recently (where the client-side
-- syncOneSignal* hooks don't run).
--
-- Reuses the existing cron_evening_pushes_secret vault entry for auth.

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-onesignal-sync'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-onesignal-sync',
  '7 * * * *', -- 7 minutes past the hour, off the busy on-the-hour bucket
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-onesignal-sync',
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
