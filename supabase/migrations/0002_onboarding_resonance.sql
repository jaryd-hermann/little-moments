-- ============================================================
-- ONBOARDING PHASE + RESONANCE / PURPOSE
-- ============================================================

alter table public.profiles
  add column if not exists onboarding_phase text default 'resonance'
    check (onboarding_phase in (
      'resonance',
      'follow_up',
      'slides',
      'trial',
      'notifications',
      'done'
    )),
  add column if not exists resonance_option_ids uuid[] default '{}',
  add column if not exists follow_up_screen_key text;

update public.profiles
set onboarding_phase = 'done'
where onboarding_completed = true;

update public.profiles
set onboarding_phase = 'resonance'
where onboarding_completed = false
  and (onboarding_phase is null or onboarding_phase = 'resonance');

create table public.purpose_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  tag text not null
    check (tag in ('time', 'storytelling', 'habit', 'presence', 'memory', 'legacy')),
  sort_order integer not null default 0,
  selection_count integer not null default 0,
  created_at timestamptz default now()
);

create table public.user_resonance_selections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  purpose_option_id uuid not null references public.purpose_options(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, purpose_option_id)
);

create index purpose_options_sort_idx on public.purpose_options (sort_order);

insert into public.purpose_options (label, tag, sort_order) values
  ('I feel like days are blurring together', 'time', 1),
  ('I can''t remember what happened last week', 'time', 2),
  ('I want to be a better storyteller', 'storytelling', 3),
  ('I want a journaling habit that actually sticks', 'habit', 4),
  ('I go through the motions without noticing what matters', 'presence', 5),
  ('I don''t want to forget the small stuff', 'memory', 6),
  ('I want to stop losing days I''ll never get back', 'time', 7),
  ('I struggle to tell interesting stories about my life', 'storytelling', 8);

create or replace function public.bump_purpose_option_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.purpose_options
  set selection_count = selection_count + 1
  where id = new.purpose_option_id;
  return new;
end;
$$;

create trigger tr_user_resonance_bump
  after insert on public.user_resonance_selections
  for each row execute function public.bump_purpose_option_count();

create or replace function public.record_resonance_selections(
  p_option_ids uuid[],
  p_follow_up_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  opt uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if p_option_ids is null or cardinality(p_option_ids) = 0 then
    raise exception 'select at least one option';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = uid
      and cardinality(coalesce(p.resonance_option_ids, '{}')) > 0
  ) then
    update public.profiles
    set follow_up_screen_key = coalesce(p_follow_up_key, follow_up_screen_key),
        onboarding_phase = 'follow_up',
        updated_at = now()
    where id = uid;
    return;
  end if;

  FOREACH opt IN ARRAY p_option_ids LOOP
    insert into public.user_resonance_selections (user_id, purpose_option_id)
    values (uid, opt);
  END LOOP;

  update public.profiles
  set resonance_option_ids = p_option_ids,
      follow_up_screen_key = p_follow_up_key,
      onboarding_phase = 'follow_up',
      updated_at = now()
  where id = uid;
end;
$$;

grant execute on function public.record_resonance_selections(uuid[], text) to authenticated;

alter table public.purpose_options enable row level security;
alter table public.user_resonance_selections enable row level security;

create policy "purpose_options_select_authenticated"
  on public.purpose_options for select
  to authenticated
  using (true);

create policy "user_resonance_select_own"
  on public.user_resonance_selections for select
  using (auth.uid() = user_id);

create policy "user_resonance_insert_own"
  on public.user_resonance_selections for insert
  with check (auth.uid() = user_id);

-- Aggregated view (optional analytics / SQL): same as purpose_options counts
create or replace view public.purpose as
  select id, label, tag, sort_order, selection_count
  from public.purpose_options;

grant select on public.purpose to authenticated;
