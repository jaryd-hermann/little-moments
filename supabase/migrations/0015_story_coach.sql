-- ============================================================
-- STORY COACH
-- Adds coaching sessions table, story_coach_enabled profile
-- flag, and expands onboarding_phase to include story_coach.
-- ============================================================

-- 1. Profile: add story_coach_enabled
alter table public.profiles
  add column if not exists story_coach_enabled boolean default false;

-- 2. Expand onboarding_phase check to include 'story_coach'
alter table public.profiles
  drop constraint if exists profiles_onboarding_phase_check;

alter table public.profiles
  add constraint profiles_onboarding_phase_check
    check (onboarding_phase in (
      'resonance',
      'follow_up',
      'slides',
      'donation',
      'trial',
      'notifications',
      'story_coach',
      'done'
    ));

-- 3. Coaching sessions table
create table public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  conversation jsonb not null default '[]'::jsonb,
  feedback_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- One coaching session per entry
create unique index coaching_sessions_entry_unique
  on public.coaching_sessions (user_id, entry_id);

create index coaching_sessions_user_created_idx
  on public.coaching_sessions (user_id, created_at desc);

-- Auto-update updated_at
create trigger coaching_sessions_updated_at
  before update on public.coaching_sessions
  for each row execute function handle_updated_at();

-- 4. Row Level Security
alter table public.coaching_sessions enable row level security;

create policy "coaching_sessions_select_own"
  on public.coaching_sessions for select
  using (auth.uid() = user_id);

create policy "coaching_sessions_insert_own"
  on public.coaching_sessions for insert
  with check (auth.uid() = user_id);

create policy "coaching_sessions_update_own"
  on public.coaching_sessions for update
  using (auth.uid() = user_id);

create policy "coaching_sessions_delete_own"
  on public.coaching_sessions for delete
  using (auth.uid() = user_id);
