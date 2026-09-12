-- Keep the original audio from a voice-captured moment.
--
-- These live on `entries` rather than as an `entry_media` row on purpose:
-- `entry_media` feeds shares, summary cards and every montage/movie surface,
-- and the voice note is meant to appear ONLY on the moment detail screen.
-- Separate columns keep it out of those render paths by construction.

alter table public.entries
  add column if not exists voice_note_storage_path text,
  add column if not exists voice_note_storage_url text,
  add column if not exists voice_note_duration_seconds integer;

comment on column public.entries.voice_note_storage_url is
  'Original voice-capture audio. Moment detail screen only — never shares or summary cards.';
