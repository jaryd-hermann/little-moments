-- ============================================================
-- PROFILES
-- Extends Supabase auth.users with app-specific fields
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  display_name text,
  avatar_url text,
  color_theme text default 'light' check (color_theme in ('light', 'dark')),
  notification_enabled boolean default true,
  notification_time time default '20:00:00',
  streak_at_risk_enabled boolean default true,
  trial_start_date timestamptz,
  subscription_status text default 'trial'
    check (subscription_status in ('trial', 'active', 'expired', 'cancelled')),
  revenuecat_customer_id text,
  streak_count integer default 0,
  longest_streak integer default 0,
  last_entry_date date,
  total_moments integer default 0,
  onboarding_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- ENTRIES
-- One per user per calendar day (enforced via unique index)
-- entry_type: 'moment' | 'crash_and_burn'
-- date_precision: 'exact' | 'month_only' | 'year_only'
-- ============================================================
create table public.entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text,
  body text not null,
  ai_enhanced_body text,
  original_body text,
  entry_type text default 'moment'
    check (entry_type in ('moment', 'crash_and_burn')),
  entry_date date,
  entry_month integer check (entry_month between 1 and 12),
  entry_year integer not null,
  date_precision text default 'exact'
    check (date_precision in ('exact', 'month_only', 'year_only')),
  word_of_day text,
  ai_conversation jsonb,
  is_ai_enhanced boolean default false,
  streak_day_number integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enforce one entry per user per calendar day (exact dates only)
create unique index entries_one_per_day
  on public.entries (user_id, entry_date)
  where (date_precision = 'exact' and entry_date is not null);

-- ============================================================
-- ENTRY MEDIA
-- Photos and videos attached to entries
-- Stored in Supabase Storage bucket: 'entry-media'
-- Path pattern: {user_id}/{entry_id}/{filename}
-- ============================================================
create table public.entry_media (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid references public.entries(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  storage_path text not null,
  storage_url text,
  media_type text check (media_type in ('image', 'video')),
  display_order integer default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index entries_user_id_idx on public.entries(user_id);
create index entries_entry_date_idx on public.entries(entry_date);
create index entries_entry_year_idx on public.entries(entry_year);
create index entries_entry_type_idx on public.entries(entry_type);
create index entries_created_at_idx on public.entries(created_at desc);
create index entry_media_entry_id_idx on public.entry_media(entry_id);

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================
create or replace function handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger entries_updated_at
  before update on public.entries
  for each row execute function handle_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function handle_updated_at();

-- ============================================================
-- TRIGGER — auto-create profile on user signup
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, trial_start_date)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    now()
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.entry_media enable row level security;

-- Profiles: users can only read/write their own
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Entries: users can only CRUD their own
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id);
create policy "entries_delete_own" on public.entries
  for delete using (auth.uid() = user_id);

-- Entry media: users can only CRUD their own
create policy "entry_media_select_own" on public.entry_media
  for select using (auth.uid() = user_id);
create policy "entry_media_insert_own" on public.entry_media
  for insert with check (auth.uid() = user_id);
create policy "entry_media_delete_own" on public.entry_media
  for delete using (auth.uid() = user_id);

-- ============================================================
-- STORAGE BUCKET (create manually in Supabase dashboard)
-- Bucket name: 'entry-media'
-- Access: private
--
-- Storage RLS policies (set in dashboard):
-- SELECT: bucket_id = 'entry-media' AND auth.uid()::text = (storage.foldername(name))[1]
-- INSERT: bucket_id = 'entry-media' AND auth.uid()::text = (storage.foldername(name))[1]
-- DELETE: bucket_id = 'entry-media' AND auth.uid()::text = (storage.foldername(name))[1]
-- ============================================================
