-- ============================================================
-- FREEMIUM CONVERSION
-- Move from trial-based model to freemium.
--   1. Add 'free' to subscription_status enum
--   2. Migrate existing 'trial' users → 'free'
--   3. Update handle_new_user() to default to 'free' (no trial_start_date)
--   4. Unschedule the trial-expiring cron job
-- ============================================================

-- 1. Widen the check constraint to include 'free'
alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('free', 'trial', 'active', 'expired', 'cancelled'));

-- 2. Migrate all current trial users to free
update public.profiles
  set subscription_status = 'free'
  where subscription_status = 'trial';

-- 3. Replace the signup trigger so new users get status='free', no trial_start_date
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, subscription_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'free'
  );
  return new;
end;
$$ language plpgsql security definer;

-- 4. Unschedule the trial-expiring cron job
do $$
declare
  r record;
begin
  for r in select jobid from cron.job where jobname = 'cron-trial-expiring'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end $$;
