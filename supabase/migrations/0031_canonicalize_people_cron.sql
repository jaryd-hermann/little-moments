-- ============================================================
-- GRAPH: Nightly cron to canonicalise people + places for users
-- with new metadata since the last analysis.
--
-- Runs at 03:15 UTC — after cron-threads-nightly (02:00) finishes
-- writing new entry_metadata rows, so the canonicalisation reflects
-- yesterday's entries.
-- ============================================================

-- Helper: pick users with metadata activity in the last 2 days, then
-- fan out one POST per user. Kept inline so we can tweak the cadence
-- without deploying an edge function.
select cron.schedule(
  'cron-canonicalize-people-nightly',
  '15 3 * * *',
  $$
  do $inner$
  declare
    r record;
    fn_url text := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/canonicalize-people';
    bearer text := 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
  begin
    for r in
      select distinct user_id
      from public.entry_metadata
      where extracted_at > now() - interval '2 days'
    loop
      perform net.http_post(
        url := fn_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', bearer
        ),
        body := jsonb_build_object('user_id', r.user_id)
      );
    end loop;
  end $inner$;
  $$
);
