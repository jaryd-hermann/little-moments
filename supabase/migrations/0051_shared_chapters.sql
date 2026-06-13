-- Shared chapters: opt-in public sharing of weekly/monthly chapters via unique token.
-- Mirrors the `shared_entries` table created in 0019.
create table public.shared_chapters (
  id uuid default gen_random_uuid() primary key,
  chapter_id uuid references public.chapters(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  share_token text not null,
  created_at timestamptz default now()
);

create unique index shared_chapters_token_idx on public.shared_chapters(share_token);
create unique index shared_chapters_user_chapter_idx on public.shared_chapters(user_id, chapter_id);

alter table public.shared_chapters enable row level security;

create policy "shared_chapters_select_own" on public.shared_chapters
  for select using (auth.uid() = user_id);
create policy "shared_chapters_insert_own" on public.shared_chapters
  for insert with check (auth.uid() = user_id);
create policy "shared_chapters_delete_own" on public.shared_chapters
  for delete using (auth.uid() = user_id);
