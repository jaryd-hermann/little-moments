-- ============================================================
-- ENTRIES — record the recency bucket and age (in days) of the
-- photo behind each saved moment so we can analyse whether users
-- prefer recent vs. older photos at both the population and
-- individual level.
--
-- These columns are nullable because not every entry has a photo
-- (word and freetext flows save without one). They are written
-- once on insert and never updated.
--
-- Bucket boundaries (mirror /lib/photoBucket.ts):
--   recent    : 0–90  days old
--   older     : 91–365 days old
--   throwback : 366+ days old
-- ============================================================

alter table public.entries
  add column if not exists photo_bucket_at_save text
    check (photo_bucket_at_save in ('recent', 'older', 'throwback'));

alter table public.entries
  add column if not exists photo_age_days_at_save integer
    check (photo_age_days_at_save is null or photo_age_days_at_save >= 0);

create index if not exists entries_photo_bucket_at_save_idx
  on public.entries (photo_bucket_at_save)
  where photo_bucket_at_save is not null;
