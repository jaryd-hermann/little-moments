-- ============================================================
-- CHAPTERS — convert from monthly to weekly
-- Adds ISO week reference columns and a new uniqueness rule.
-- Existing monthly chapters remain in the table (they keep
-- ref_month / ref_year). Weekly chapters identify themselves
-- by having ref_week_start_date set.
-- ============================================================

-- Make legacy monthly columns nullable (weekly chapters won't fill them).
alter table public.chapters
  alter column ref_month drop not null;

alter table public.chapters
  alter column ref_year drop not null;

-- New weekly reference columns.
alter table public.chapters
  add column if not exists ref_iso_week smallint
    check (ref_iso_week is null or ref_iso_week between 1 and 53);

alter table public.chapters
  add column if not exists ref_iso_week_year smallint;

alter table public.chapters
  add column if not exists ref_week_start_date date;

-- Replace the (user_id, ref_year, ref_month) unique index with a partial
-- index that still protects legacy rows, and add a partial index for the
-- new weekly chapter rows. Both partial indexes coexist safely.
drop index if exists chapters_user_month_uidx;

create unique index if not exists chapters_user_month_uidx
  on public.chapters (user_id, ref_year, ref_month)
  where ref_month is not null;

create unique index if not exists chapters_user_week_uidx
  on public.chapters (user_id, ref_iso_week_year, ref_iso_week)
  where ref_iso_week is not null;

create index if not exists chapters_user_week_start_idx
  on public.chapters (user_id, ref_week_start_date)
  where ref_week_start_date is not null;
