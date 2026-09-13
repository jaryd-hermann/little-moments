-- Schedule cron-widget-nudge every 15 minutes.
-- The function only sends inside a 20-minute local window at 11:00, so a
-- 15-minute cadence guarantees every timezone gets exactly one chance.
-- Reuses vault secret `cron_evening_pushes_secret` (= Edge Function CRON_SECRET).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-widget-nudge'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-widget-nudge',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-widget-nudge',
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
