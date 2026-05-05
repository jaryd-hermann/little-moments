-- ============================================================
-- ENTRY MEDIA — store the photo's original capture time so the
-- Capsule flipbook can show the date the photo was taken (not
-- the date the moment was captured in-app).
-- ============================================================

alter table public.entry_media
  add column if not exists taken_at timestamptz;

create index if not exists entry_media_taken_at_idx
  on public.entry_media (taken_at)
  where taken_at is not null;
