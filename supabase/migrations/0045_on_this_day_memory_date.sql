-- "On this day" push: match anniversaries by the memory date (photo taken_at
-- in the user's notification timezone), not the journal capture day (entry_date).

create or replace function public.on_this_day_match_entry(
  p_user_id uuid,
  p_target_date date,
  p_tz text
)
returns table (
  id uuid,
  title text,
  body text,
  ai_enhanced_body text,
  entry_date date,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.title,
    e.body,
    e.ai_enhanced_body,
    e.entry_date,
    e.created_at
  from public.entries e
  where e.user_id = p_user_id
    and e.entry_type = 'moment'
    and e.date_precision = 'exact'
    and coalesce(
      (
        select (em.taken_at at time zone p_tz)::date
        from public.entry_media em
        where em.entry_id = e.id
          and em.taken_at is not null
        order by em.display_order nulls last, em.id asc
        limit 1
      ),
      e.entry_date
    ) = p_target_date
  order by e.created_at desc
  limit 1;
$$;

revoke all on function public.on_this_day_match_entry(uuid, date, text) from public;
grant execute on function public.on_this_day_match_entry(uuid, date, text) to service_role;
