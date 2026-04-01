-- ============================================================
-- DONATION CAUSES
-- Tracks cause selections for 5% revenue donations
-- ============================================================

create table public.donation_causes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_label text not null,
  org_name text not null,
  description text not null,
  donation_link text not null,
  image_key text not null,
  sort_order integer not null default 0,
  selection_count integer not null default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- USER DONATION SELECTIONS (analytics / tracking)
-- One row per user; upsert on change.
-- ============================================================

create table public.user_donation_selections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  donation_cause_id uuid not null references public.donation_causes(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id)
);

-- ============================================================
-- ADD donation_cause_id TO PROFILES
-- ============================================================

alter table public.profiles
  add column if not exists donation_cause_id uuid references public.donation_causes(id);

-- ============================================================
-- EXPAND onboarding_phase CHECK TO INCLUDE 'donation'
-- ============================================================

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
      'done'
    ));

-- ============================================================
-- SEED 6 CAUSES
-- ============================================================

insert into public.donation_causes (title, category_label, org_name, description, donation_link, image_key, sort_order) values
  (
    'Environment',
    'PLANET & SUSTAINABILITY',
    'Founders Pledge: Climate Fund',
    'Protect ecosystems and fight climate change. Your support funds high-impact initiatives that reduce carbon emissions, restore natural habitats, and drive systemic solutions to the climate crisis.',
    'https://www.every.org/climate.fund',
    'environment',
    1
  ),
  (
    'Research',
    'SCIENCE & INNOVATION',
    'Founders Pledge',
    'Advance scientific research that shapes a better future. Your support funds evidence-based programs tackling global challenges—from emerging technologies to policy research that drives real-world impact.',
    'https://www.every.org/founderspledge',
    'research',
    2
  ),
  (
    'Mental Health',
    'WELLNESS & SUPPORT',
    'The Scars Foundation',
    'Expand access to mental health resources for those who need it most. Your support funds awareness campaigns, direct services, and community programs that break down barriers to care.',
    'https://www.every.org/scarsfoundation',
    'mental-health',
    3
  ),
  (
    'Education',
    'LEARNING & OPPORTUNITY',
    'No End To Love Inc.',
    'Provide educational opportunities to underserved communities. Your support funds schools, supplies learning materials, offers scholarships, and creates programs that give children and adults the tools they need to succeed.',
    'https://www.every.org/noendtolove',
    'education',
    4
  ),
  (
    'Animals',
    'ANIMAL WELFARE',
    'Lil BUB''s Big Fund',
    'Give animals a second chance at life. Your support funds rescue operations, veterinary care, shelter improvements, and adoption programs for animals in need.',
    'https://www.every.org/lilbubsbigfund',
    'animals',
    5
  ),
  (
    'Health',
    'GLOBAL HEALTH',
    'Shoe4Africa',
    'Improve health outcomes in underserved communities around the world. Your support funds hospitals, medical supplies, health education, and programs that save lives where resources are scarce.',
    'https://www.every.org/shoe4africa',
    'health',
    6
  );

-- ============================================================
-- TRIGGER: bump selection_count on cause when user selects
-- ============================================================

create or replace function public.bump_donation_cause_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    update public.donation_causes
    set selection_count = selection_count + 1
    where id = new.donation_cause_id;
    return new;
  end if;

  if (TG_OP = 'UPDATE' and old.donation_cause_id is distinct from new.donation_cause_id) then
    update public.donation_causes
    set selection_count = selection_count - 1
    where id = old.donation_cause_id;

    update public.donation_causes
    set selection_count = selection_count + 1
    where id = new.donation_cause_id;
    return new;
  end if;

  return new;
end;
$$;

create trigger tr_user_donation_bump
  after insert or update on public.user_donation_selections
  for each row execute function public.bump_donation_cause_count();

-- ============================================================
-- RPC: record_donation_cause
-- Sets profile cause, upserts tracking row, advances phase
-- ============================================================

create or replace function public.record_donation_cause(p_cause_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set donation_cause_id = p_cause_id,
      onboarding_phase = case
        when onboarding_phase = 'donation' then 'trial'
        else onboarding_phase
      end,
      updated_at = now()
  where id = uid;

  insert into public.user_donation_selections (user_id, donation_cause_id)
  values (uid, p_cause_id)
  on conflict (user_id)
  do update set
    donation_cause_id = excluded.donation_cause_id,
    updated_at = now();
end;
$$;

grant execute on function public.record_donation_cause(uuid) to authenticated;

-- ============================================================
-- RPC: update_donation_cause (settings — no phase change)
-- ============================================================

create or replace function public.update_donation_cause(p_cause_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  update public.profiles
  set donation_cause_id = p_cause_id,
      updated_at = now()
  where id = uid;

  insert into public.user_donation_selections (user_id, donation_cause_id)
  values (uid, p_cause_id)
  on conflict (user_id)
  do update set
    donation_cause_id = excluded.donation_cause_id,
    updated_at = now();
end;
$$;

grant execute on function public.update_donation_cause(uuid) to authenticated;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.donation_causes enable row level security;
alter table public.user_donation_selections enable row level security;

create policy "donation_causes_select_authenticated"
  on public.donation_causes for select
  to authenticated
  using (true);

create policy "user_donation_select_own"
  on public.user_donation_selections for select
  using (auth.uid() = user_id);

create policy "user_donation_insert_own"
  on public.user_donation_selections for insert
  with check (auth.uid() = user_id);

create policy "user_donation_update_own"
  on public.user_donation_selections for update
  using (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================

create index donation_causes_sort_idx on public.donation_causes (sort_order);
