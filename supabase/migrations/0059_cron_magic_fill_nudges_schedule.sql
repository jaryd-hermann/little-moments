-- Schedule cron-magic-fill-nudges every 30 minutes.
-- Reuses vault secret `cron_evening_pushes_secret` (= Edge Function CRON_SECRET).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-magic-fill-nudges'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-magic-fill-nudges',
  '*/30 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-magic-fill-nudges',
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
