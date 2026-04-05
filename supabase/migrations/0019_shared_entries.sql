-- Shared entries: opt-in public sharing of moments via unique token
create table public.shared_entries (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid references public.entries(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  share_token text not null,
  created_at timestamptz default now()
);

create unique index shared_entries_token_idx on public.shared_entries(share_token);
create unique index shared_entries_user_entry_idx on public.shared_entries(user_id, entry_id);

alter table public.shared_entries enable row level security;

create policy "shared_entries_select_own" on public.shared_entries
  for select using (auth.uid() = user_id);
create policy "shared_entries_insert_own" on public.shared_entries
  for insert with check (auth.uid() = user_id);
create policy "shared_entries_delete_own" on public.shared_entries
  for delete using (auth.uid() = user_id);
