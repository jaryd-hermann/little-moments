-- Stable 1-indexed position per user (oldest thread = 1) for paywall gating
-- and paginated feed loads without fetching the full thread history.

alter table public.threads
  add column if not exists chronological_index integer;

-- Backfill existing rows oldest-first per user.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at asc, id asc
    ) as idx
  from public.threads
)
update public.threads t
set chronological_index = ranked.idx
from ranked
where t.id = ranked.id
  and t.chronological_index is null;

alter table public.threads
  alter column chronological_index set not null;

create unique index if not exists threads_user_chronological_idx
  on public.threads (user_id, chronological_index);

create index if not exists threads_user_created_feed_idx
  on public.threads (user_id, created_at desc, id desc);

-- Assign the next index on insert (service + client inserts).
create or replace function public.set_thread_chronological_index()
returns trigger
language plpgsql
as $$
begin
  if new.chronological_index is null then
    select coalesce(max(chronological_index), 0) + 1
      into new.chronological_index
    from public.threads
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists threads_set_chronological_index on public.threads;

create trigger threads_set_chronological_index
before insert on public.threads
for each row
execute function public.set_thread_chronological_index();
