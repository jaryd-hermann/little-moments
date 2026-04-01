-- ============================================================
-- CHAPTERS — monthly AI-generated chapter summaries
-- ============================================================

create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_number integer not null,
  ref_year integer not null,
  ref_month integer not null check (ref_month between 1 and 12),
  moment_count integer not null default 0,
  slides jsonb not null
    check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) >= 1),
  image_slide jsonb,
  source_entry_ids uuid[] not null default '{}',
  source_media_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One chapter per user per month (idempotency)
create unique index chapters_user_month_uidx
  on public.chapters (user_id, ref_year, ref_month);

-- Sequential chapter numbers per user
create unique index chapters_user_number_uidx
  on public.chapters (user_id, chapter_number);

create index chapters_user_id_idx on public.chapters (user_id);

alter table public.chapters enable row level security;

create policy "chapters_select_own" on public.chapters
  for select using (auth.uid() = user_id);

create trigger chapters_updated_at
  before update on public.chapters
  for each row execute function handle_updated_at();

-- ============================================================
-- Extend entries to support chapter type + FK
-- ============================================================

-- Drop and recreate the check constraint to include 'chapter'
alter table public.entries
  drop constraint if exists entries_entry_type_check;

alter table public.entries
  add constraint entries_entry_type_check
  check (entry_type in ('moment', 'crash_and_burn', 'chapter'));

alter table public.entries
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null;

create index if not exists entries_chapter_id_idx on public.entries (chapter_id)
  where chapter_id is not null;

-- Add chapter push deduplication column to profiles
alter table public.profiles
  add column if not exists last_chapter_push_local_date date;
