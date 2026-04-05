-- ============================================================
-- V2 ONBOARDING
-- Expands onboarding_phase for the new v2 flow (personalized,
-- activation), adds activation tracking columns, defaults
-- story_coach_enabled to true, and removes storytelling-
-- related purpose_options rows.
-- ============================================================

-- 1. Expand onboarding_phase check to include new v2 phases
alter table public.profiles
  drop constraint if exists profiles_onboarding_phase_check;

alter table public.profiles
  add constraint profiles_onboarding_phase_check
    check (onboarding_phase in (
      'resonance',
      'follow_up',
      'slides',
      'donation',
      'trial',
      'notifications',
      'story_coach',
      'personalized',
      'activation',
      'done'
    ));

-- 2. Add activation tracking columns
alter table public.profiles
  add column if not exists activation_word_completed boolean default false,
  add column if not exists activation_photo_completed boolean default false;

-- 3. Default story_coach_enabled to true for new users
alter table public.profiles
  alter column story_coach_enabled set default true;

-- 4. Remove storytelling-related purpose_options
-- (keep the table and other rows intact — DB-controlled options)
delete from public.purpose_options
where tag = 'storytelling';

-- 5. Update the record_resonance_selections function to route
--    to 'personalized' instead of 'follow_up'
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
        onboarding_phase = 'personalized',
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
      onboarding_phase = 'personalized',
      updated_at = now()
  where id = uid;
end;
$$;
