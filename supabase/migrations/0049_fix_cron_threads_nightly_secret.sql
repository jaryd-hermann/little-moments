-- ============================================================
-- Re-schedule the two crons that read from a non-canonical vault
-- entry (`cron_secret`) so they instead use `cron_evening_pushes_secret`,
-- which is the entry kept in sync with the Edge Function `CRON_SECRET`
-- env var (see migration 0006). This was causing nightly 401s on
-- `cron-threads-nightly` (and silent 401s on
-- `cron-canonicalize-people-nightly`) once `CRON_SECRET` was rotated
-- without also updating the legacy `cron_secret` vault entry.
--
-- Also drops the legacy reliance on a `supabase_url` vault entry by
-- hardcoding the project URL the same way every other cron in this
-- repo does.
-- ============================================================

do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-threads-nightly'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
  for r in select jobid from cron.job where jobname = 'cron-canonicalize-people-nightly'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;

-- 02:00 UTC nightly — same cadence as before.
select cron.schedule(
  'cron-threads-nightly',
  '0 2 * * *',
  $invoke$
  select net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/cron-threads-nightly',
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

-- 03:15 UTC — fan out one POST per user with recent metadata. Same
-- shape as 0031 but using the canonical secret + hardcoded URL.
select cron.schedule(
  'cron-canonicalize-people-nightly',
  '15 3 * * *',
  $invoke$
  do $inner$
  declare
    r record;
    bearer text := 'Bearer ' || coalesce(
      (select decrypted_secret
       from vault.decrypted_secrets
       where name = 'cron_evening_pushes_secret'
       limit 1),
      ''
    );
  begin
    for r in
      select distinct user_id
      from public.entry_metadata
      where extracted_at > now() - interval '2 days'
    loop
      perform net.http_post(
        url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/canonicalize-people',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', bearer
        ),
        body := jsonb_build_object('user_id', r.user_id)
      );
    end loop;
  end $inner$;
  $invoke$
);
