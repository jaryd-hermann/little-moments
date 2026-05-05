-- ============================================================
-- LIFECYCLE_DISPATCHES
-- Append-only log of every push / email we send via the
-- lifecycle messaging system. Powers:
--   1. Idempotency — one-shot events use a UNIQUE constraint on
--      (user_id, event_key) so a re-tick can't double-fire.
--   2. Frequency caps — premium pitches enforce ≤1 send / 7 days
--      across all premium event_keys per user. The cap query reads
--      this table.
--   3. Funnel attribution — "of users who got the Dig Deeper
--      email, what % opened a Dig Deeper inside 48h?". We can join
--      this against entries / threads / chapters timestamps.
--
-- Each row represents a single delivery attempt that succeeded.
-- We do NOT log failed sends — failures should retry on the next
-- cron tick rather than poison the idempotency check.
-- ============================================================

create table if not exists public.lifecycle_dispatches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  -- Stable key per logical message (e.g. "premium_chapters_proactive",
  -- "first_pin_push", "lifecycle_email_dig_deeper"). Used for idempotency
  -- + cap queries; do NOT include per-event ids in here.
  event_key text not null,
  channel text not null check (channel in ('push', 'email')),
  -- Optional payload for debugging / replay / display. Keep small —
  -- not a full message body. Examples:
  --   { "thread_id": "..." }    for thread pushes
  --   { "entry_id": "..." }     for on-this-day pushes
  --   { "chapter_id": "..." }   for chapter pushes
  payload jsonb default '{}'::jsonb,
  sent_at timestamptz not null default now()
);

-- Lookup index for cap queries:
--   "has user X been sent any premium pitch in the last 7 days?"
create index if not exists lifecycle_dispatches_user_sent_idx
  on public.lifecycle_dispatches (user_id, sent_at desc);

create index if not exists lifecycle_dispatches_user_event_idx
  on public.lifecycle_dispatches (user_id, event_key);

-- Some events MUST fire only once per user, ever (e.g. first-pin push,
-- premium_chapters_proactive). We use a partial unique index keyed off
-- a marker column so we can mix one-shots and recurring events in the
-- same table without two-table complexity.
--
-- Convention: if `event_key` matches the prefixes below, treat as one-shot.
-- Reactive premium variants (b2, c2) do NOT live in this set — they fire
-- on each paywall bump (capped at one per user/week by dispatch()).
alter table public.lifecycle_dispatches
  add column if not exists is_one_shot boolean not null default false;

create unique index if not exists lifecycle_dispatches_one_shot_uidx
  on public.lifecycle_dispatches (user_id, event_key)
  where is_one_shot = true;

alter table public.lifecycle_dispatches enable row level security;

-- Service-role inserts (Edge Functions); users can read their own log
-- (useful for in-app debug screens later — feel free to keep it locked
-- down to service_role only by removing the select policy).
create policy "lifecycle_dispatches_select_own" on public.lifecycle_dispatches
  for select using (auth.uid() = user_id);

create policy "lifecycle_dispatches_insert_service" on public.lifecycle_dispatches
  for insert with check (true);

-- ============================================================
-- PAYWALL_BUMPS
-- Track every time a free user taps a locked chapter / thread.
-- Powers the reactive premium pitches (b2, c2):
--   - On bump: dispatch sends an email next morning.
--   - Reactive variants bypass the 7-day premium-pitch cap.
-- ============================================================

create table if not exists public.paywall_bumps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  surface text not null check (surface in ('chapter', 'thread', 'capsule_full', 'album')),
  -- Optional context (chapter_id / thread_id) so the follow-up email
  -- can reference the specific item the user tried to open.
  ref_id uuid,
  bumped_at timestamptz not null default now(),
  -- Set when the reactive pitch fires so we don't double-pitch on
  -- repeat bumps within the same window.
  followup_sent_at timestamptz
);

create index if not exists paywall_bumps_user_unhandled_idx
  on public.paywall_bumps (user_id, bumped_at desc)
  where followup_sent_at is null;

alter table public.paywall_bumps enable row level security;

create policy "paywall_bumps_select_own" on public.paywall_bumps
  for select using (auth.uid() = user_id);

create policy "paywall_bumps_insert_own" on public.paywall_bumps
  for insert with check (auth.uid() = user_id);
