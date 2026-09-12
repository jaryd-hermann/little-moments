-- Thread feedback loop: hide/highlight, per-event feedback, user preferences for model tuning.

alter table public.threads
  add column if not exists hidden_from_feed boolean default false,
  add column if not exists highlighted boolean default false,
  add column if not exists feedback_sentiment text
    check (feedback_sentiment is null or feedback_sentiment in ('positive', 'negative'));

create table if not exists public.thread_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  thread_id uuid references public.threads(id) on delete cascade not null,
  sentiment text not null check (sentiment in ('positive', 'negative')),
  chips text[] default '{}',
  note text,
  action text not null default 'none'
    check (action in ('none', 'hidden', 'highlighted')),
  created_at timestamptz default now()
);

create index if not exists thread_feedback_user_created_idx
  on public.thread_feedback (user_id, created_at desc);
create index if not exists thread_feedback_thread_idx
  on public.thread_feedback (thread_id);

create table if not exists public.user_thread_preferences (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  preference_summary text,
  avoid_connection_types text[] default '{}',
  seek_connection_types text[] default '{}',
  avoid_chips text[] default '{}',
  seek_chips text[] default '{}',
  updated_at timestamptz default now()
);

alter table public.thread_feedback enable row level security;
alter table public.user_thread_preferences enable row level security;

create policy "thread_feedback_select_own" on public.thread_feedback
  for select using (auth.uid() = user_id);
create policy "thread_feedback_insert_own" on public.thread_feedback
  for insert with check (auth.uid() = user_id);

create policy "user_thread_preferences_select_own" on public.user_thread_preferences
  for select using (auth.uid() = user_id);

-- Client updates hide/highlight/answer on own threads (existing update_own policy).
-- Feedback rows + preference refresh happen via edge function (service role).
