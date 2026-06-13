-- Surface a photo's EXIF location alongside the saved entry so the
-- "📍 City, Country" tag can be rendered everywhere a moment is shown.
-- All fields nullable — most uploads won't have geo metadata, and the
-- reverse-geocoding call is best-effort. We persist both the human-readable
-- name and the underlying coordinates so we can re-derive the label if
-- we ever swap reverse-geocoding providers.

alter table public.entry_media
  add column if not exists location_name text,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision;
