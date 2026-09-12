-- Schedule cron-this-day-past every 15 minutes.
-- The function contains the per-user local-time window and the once-a-week
-- cadence cap, so the tick only needs to be frequent enough to catch every
-- user's window.
-- Reuses vault secret `cron_evening_pushes_secret` (= Edge Function CRON_SECRET).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-this-day-past'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-this-day-past',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-this-day-past',
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
