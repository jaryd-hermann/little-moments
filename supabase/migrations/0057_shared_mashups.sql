-- Shared mashups: opt-in public sharing of weekly/monthly/yearly snippet movies.
create table public.shared_mashups (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  bucket_type text not null check (bucket_type in ('week', 'month', 'year')),
  bucket_key text not null,
  label text not null,
  clip_count int not null default 0,
  preview_storage_path text,
  clip_snapshots jsonb not null default '[]'::jsonb,
  share_token text not null,
  created_at timestamptz default now()
);

create unique index shared_mashups_token_idx on public.shared_mashups(share_token);
create unique index shared_mashups_user_bucket_idx
  on public.shared_mashups(user_id, bucket_type, bucket_key);

alter table public.shared_mashups enable row level security;

create policy "shared_mashups_select_own" on public.shared_mashups
  for select using (auth.uid() = user_id);
create policy "shared_mashups_insert_own" on public.shared_mashups
  for insert with check (auth.uid() = user_id);
create policy "shared_mashups_delete_own" on public.shared_mashups
  for delete using (auth.uid() = user_id);
