-- Schedule cron-evening-pushes every 15 minutes (6pm / 9pm local logic inside the function).
--
-- BEFORE applying (Supabase Dashboard → SQL Editor), run once:
--
--   1) Enable extensions (if not already): Database → Extensions → enable "pg_cron" and "pg_net".
--
--   2) Store the SAME random string you set as Edge Function secret CRON_SECRET.
--      First time only:
--        select vault.create_secret(
--          '<paste CRON_SECRET value>',
--          'cron_evening_pushes_secret'
--        );
--      If you already created it (duplicate name error), update the value instead:
--        select vault.update_secret(
--          (select id from vault.secrets where name = 'cron_evening_pushes_secret' limit 1),
--          '<paste NEW CRON_SECRET value — must match Edge Function secret>',
--          'cron_evening_pushes_secret',
--          'cron evening pushes bearer token'
--        );
--
-- If your project ref is not smwmkeoljqnifaoqzemb, edit the URL in cron.schedule below.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-evening-pushes'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

select cron.schedule(
  'cron-evening-pushes',
  '*/15 * * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-evening-pushes',
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
