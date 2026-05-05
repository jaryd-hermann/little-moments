-- ============================================================
-- THREADS + CHAPTERS — track when the owner has seen each one.
--
-- The Connect / Chapters tab icons shimmer + slow-rotate while
-- the owner has any unseen content of that kind, and the unseen
-- card itself shimmers in-feed until tapped open. `viewed_at` is
-- set the first time a user opens the detail screen.
--
-- Existing rows are backfilled to `created_at` so users don't get
-- spammed with shimmer for content that pre-dates this feature —
-- only newly produced threads / chapters start as unseen.
-- ============================================================

alter table public.threads
  add column if not exists viewed_at timestamptz;

alter table public.chapters
  add column if not exists viewed_at timestamptz;

-- Backfill: treat already-existing content as seen.
update public.threads
  set viewed_at = created_at
  where viewed_at is null;

update public.chapters
  set viewed_at = created_at
  where viewed_at is null;

-- Tab bar / hooks query "unseen and visible" frequently — partial
-- indexes keep that O(unseen) instead of O(all).
create index if not exists threads_user_unseen_idx
  on public.threads (user_id)
  where viewed_at is null and dismissed = false;

create index if not exists chapters_user_unseen_idx
  on public.chapters (user_id)
  where viewed_at is null;
