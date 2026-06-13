-- ============================================================
-- Scope the legacy chapters_user_month_uidx unique index to
-- legacy monthly rows only.
--
-- Why
-- ---
-- 0010_chapters.sql created the chapters table around monthly
-- chapters and enforced "one chapter per user per month" via a
-- unique index on (user_id, ref_year, ref_month).
--
-- 0032_chapters_weekly.sql converted chapters to weekly. Weekly
-- chapters identify themselves with a non-null
-- `ref_week_start_date` and use the partial index
-- chapters_user_week_uidx (on user_id, ref_iso_week_year,
-- ref_iso_week) for per-ISO-week uniqueness.
--
-- 0032 rewrote chapters_user_month_uidx as a partial index
-- predicated on `where ref_month is not null`. The intent was to
-- only protect legacy monthly rows — but the Edge Functions
-- (cron-chapters / generate-chapter) intentionally keep writing
-- `ref_month` / `ref_year` on weekly chapters too (used for
-- filtering + the entries-side join). As a result, the partial
-- index fires on every weekly chapter past the first one a user
-- gets in any calendar month, silently failing the insert and
-- swallowing the chapter via `continue` in cron-chapters.
--
-- Fix
-- ---
-- Narrow the predicate to legacy monthly rows only:
--   ref_month is not null AND ref_week_start_date is null.
-- Weekly rows (ref_week_start_date not null) are unaffected;
-- their uniqueness is already enforced by chapters_user_week_uidx.
-- ============================================================

drop index if exists public.chapters_user_month_uidx;

create unique index chapters_user_month_uidx
  on public.chapters (user_id, ref_year, ref_month)
  where ref_month is not null
    and ref_week_start_date is null;
