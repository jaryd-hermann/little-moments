-- Pin favorite moments for quick access in Capsule and Flipbook
alter table public.entries
  add column if not exists is_pinned boolean not null default false;

create index if not exists entries_user_pinned_idx
  on public.entries (user_id)
  where is_pinned = true;
