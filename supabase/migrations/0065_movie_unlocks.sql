-- Movie unlocks: the server's record that a user has earned a movie.
--
-- Movies themselves are still assembled on-device from entries + entry_media
-- (see lib/mashupBuckets.ts) — nothing here stores clips. This table exists so
-- that "you've just unlocked a movie" can be pushed exactly once per movie,
-- and so a movie a user has never opened can be badged later.

create table public.movie_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Mirrors MashupBucketType on the client.
  kind text not null check (kind in ('week', 'month', 'year', 'person', 'theme')),
  -- Period key ("2026-06-08" / "2026-06" / "2026"), canonical person name,
  -- or theme slug.
  bucket_key text not null,
  -- Display label at unlock time ("2nd week of June", "Julia", "Family").
  -- Denormalised so a push reads correctly even if canonicalization later
  -- renames the person.
  label text not null,
  moment_count int not null default 0,
  unlocked_at timestamptz not null default now(),
  -- Null until the "you've unlocked a movie" push goes out. Rows seeded for
  -- existing users are stamped up front so nobody gets a backlog of pushes.
  notified_at timestamptz,
  viewed_at timestamptz
);

-- One row per movie. Also the race guard: two saves landing at once both try
-- to insert, and the loser is a no-op rather than a duplicate push.
create unique index movie_unlocks_user_kind_key_uidx
  on public.movie_unlocks (user_id, kind, bucket_key);

-- Hot path: "does this user have an un-pushed unlock?"
create index movie_unlocks_pending_idx
  on public.movie_unlocks (user_id)
  where notified_at is null;

alter table public.movie_unlocks enable row level security;

create policy "Users can view own movie unlocks"
  on public.movie_unlocks for select
  using (auth.uid() = user_id);

-- Only `viewed_at` is a client concern; inserts and notified_at belong to the
-- edge functions running as service role.
create policy "Users can update own movie unlocks"
  on public.movie_unlocks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
