-- Allow sharing person mashups. The 2.4.0 build adds a 'person' mashup bucket,
-- but the check constraint from 0057 only permitted week/month/year, so every
-- person-bucket share insert failed with Postgres code 23514.
alter table public.shared_mashups
  drop constraint if exists shared_mashups_bucket_type_check;

alter table public.shared_mashups
  add constraint shared_mashups_bucket_type_check
  check (bucket_type in ('week', 'month', 'year', 'person'));
