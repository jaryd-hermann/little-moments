-- Schedule cron-weekly-chapter-intro every 15 minutes. The function itself
-- enforces the "Monday at 12:00 local" window per user (timezones vary).
--
-- BEFORE applying (Supabase Dashboard → SQL Editor):
--
--   1) pg_cron + pg_net must already be enabled (they are if 0006 ran).
--
--   2) The CRON_SECRET vault entry created in 0006 is reused — no new secret.
--      We read `cron_evening_pushes_secret` so we don't end up with one entry
--      per cron job. If you ever rotate CRON_SECRET, update that one secret
--      and every cron job picks up the new value.
--
-- If your project ref is not smwmkeoljqnifaoqzemb, edit the URL below.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-weekly-chapter-intro'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-weekly-chapter-intro',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-weekly-chapter-intro',
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
