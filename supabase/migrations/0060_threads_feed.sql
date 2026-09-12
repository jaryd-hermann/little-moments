-- Threads feed: short hook copy, single question, user answers, tab-level unread.

alter table public.threads
  add column if not exists statement text,
  add column if not exists question text,
  add column if not exists user_answer text,
  add column if not exists answered_at timestamptz;

alter table public.user_thread_stats
  add column if not exists connections_tab_seen_at timestamptz;

-- Client-callable: mark Connect tab as seen (drives tab-bar unread badge).
create or replace function public.mark_connections_tab_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  seen_at timestamptz := now();
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_thread_stats (user_id, connections_tab_seen_at)
  values (uid, seen_at)
  on conflict (user_id)
  do update set connections_tab_seen_at = excluded.connections_tab_seen_at;

  return seen_at;
end;
$$;

revoke all on function public.mark_connections_tab_seen() from public;
grant execute on function public.mark_connections_tab_seen() to authenticated;
