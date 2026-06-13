-- ============================================================
-- ENTRY MEDIA — Live Photo support.
--
-- iOS Live Photos pair a still image with a short paired video.
-- We persist both so the app can loop the video as a "live" image
-- everywhere the still is rendered. Android falls back to the still.
--
-- These fields are nullable so legacy rows and non-Live photos
-- continue to work as before. They live on the existing image row
-- (no extra row) so existing display_order logic is unaffected.
-- ============================================================

alter table public.entry_media
  add column if not exists paired_video_storage_path text,
  add column if not exists paired_video_storage_url text;
