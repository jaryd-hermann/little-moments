-- ============================================================
-- ALLOW MULTIPLE ENTRIES PER DAY
-- The activation flow creates word + photo + prompt moments on
-- the same day. Drop the one-per-day unique constraint.
-- ============================================================

drop index if exists public.entries_one_per_day;
