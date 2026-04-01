-- Push tokens (Expo) + fields for server-scheduled nudges and badge dedupe

alter table public.profiles
  add column if not exists notification_timezone text;

alter table public.profiles
  add column if not exists badge_push_state jsonb not null default '{}'::jsonb;

alter table public.profiles
  add column if not exists last_daily_push_local_date date;

alter table public.profiles
  add column if not exists last_streak_risk_push_local_date date;

alter table public.profiles
  alter column notification_time set default '18:00:00';

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  updated_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android'))
);

create unique index if not exists push_tokens_user_token_uidx
  on public.push_tokens (user_id, expo_push_token);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);

create policy "push_tokens_insert_own" on public.push_tokens
  for insert with check (auth.uid() = user_id);

create policy "push_tokens_update_own" on public.push_tokens
  for update using (auth.uid() = user_id);

create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- Avoid re-firing badge pushes for users who already earned them before push existed
update public.profiles p
set badge_push_state = coalesce(p.badge_push_state, '{}'::jsonb)
  || jsonb_build_object('story_starter', true)
where p.total_moments >= 1;

update public.profiles p
set badge_push_state = coalesce(p.badge_push_state, '{}'::jsonb)
  || jsonb_build_object('story_finder', true)
where exists (
  select 1 from public.entries e
  where e.user_id = p.id and e.entry_type = 'crash_and_burn'
);
