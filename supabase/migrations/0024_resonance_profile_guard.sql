-- ============================================================
-- RESONANCE PROFILE GUARD
-- Ensure record_resonance_selections can recover when an auth user
-- exists but their profiles row is missing.
-- ============================================================

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

  -- Recover from orphaned auth users by creating the missing profile row.
  insert into public.profiles (id, email, display_name, subscription_status, onboarding_phase)
  select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data->>'full_name', u.email),
    'free',
    'resonance'
  from auth.users u
  where u.id = uid
  on conflict (id) do nothing;

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
