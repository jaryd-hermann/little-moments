-- ============================================================
-- THREADS: Memory Connection Intelligence
--   1. Enable pgvector extension
--   2. Add embedding column to entries
--   3. Create entry_metadata table (extracted people, places, feelings, etc.)
--   4. Create threads table (connections between entries)
--   5. Create user_thread_stats table (denormalized per-user aggregates)
--   6. Indexes (HNSW for cosine similarity, lookup indexes)
--   7. RLS policies
-- ============================================================

-- 1. Enable pgvector
create extension if not exists vector with schema extensions;

-- 2. Embedding column — 1536 dims (text-embedding-3-large with dimensions=1536).
--    pgvector HNSW on hosted Postgres is capped at 2000 dimensions; 3072 fails with ERROR 54000.
alter table public.entries add column if not exists embedding extensions.vector(1536);

-- 3. Extracted metadata per entry
create table public.entry_metadata (
  id uuid default gen_random_uuid() primary key,
  entry_id uuid references public.entries(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  people text[] default '{}',
  places text[] default '{}',
  named_feelings text[] default '{}',
  sensory_details text[] default '{}',
  primary_emotion text,
  primary_theme text,
  extracted_at timestamptz default now(),
  constraint entry_metadata_entry_unique unique (entry_id)
);

-- 4. Thread connections
create table public.threads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  entry_id_a uuid references public.entries(id) on delete cascade not null,
  entry_id_b uuid references public.entries(id) on delete cascade not null,
  connection_type text not null check (connection_type in (
    'thematic', 'emotional', 'person', 'place', 'pattern', 'evolution'
  )),
  ellie_observation text not null,
  questions jsonb default '[]',
  confidence float not null check (confidence >= 0 and confidence <= 1),
  surfaced_in_chat boolean default false,
  surfaced_in_chat_at timestamptz,
  push_sent boolean default false,
  email_sent boolean default false,
  dismissed boolean default false,
  created_at timestamptz default now(),
  constraint threads_unique_pair unique (entry_id_a, entry_id_b)
);

-- 5. Per-user stats (denormalized for fast reads)
create table public.user_thread_stats (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  total_connections int default 0,
  last_analyzed_at timestamptz,
  recurring_people jsonb default '{}',
  recurring_places jsonb default '{}',
  dominant_themes jsonb default '{}'
);

-- 6. Indexes
create index entries_embedding_hnsw_idx on public.entries
  using hnsw (embedding extensions.vector_cosine_ops);

create index threads_user_created_idx on public.threads (user_id, created_at desc);
create index threads_user_dismissed_idx on public.threads (user_id, dismissed);
create index threads_entry_a_idx on public.threads (entry_id_a);
create index threads_entry_b_idx on public.threads (entry_id_b);
create index entry_metadata_entry_idx on public.entry_metadata (entry_id);
create index entry_metadata_user_idx on public.entry_metadata (user_id);

-- 7. RLS

-- entry_metadata
alter table public.entry_metadata enable row level security;

create policy "entry_metadata_select_own" on public.entry_metadata
  for select using (auth.uid() = user_id);
create policy "entry_metadata_insert_service" on public.entry_metadata
  for insert with check (true);
create policy "entry_metadata_update_service" on public.entry_metadata
  for update using (true);

-- threads
alter table public.threads enable row level security;

create policy "threads_select_own" on public.threads
  for select using (auth.uid() = user_id);
create policy "threads_insert_service" on public.threads
  for insert with check (true);
create policy "threads_update_own" on public.threads
  for update using (auth.uid() = user_id);

-- user_thread_stats
alter table public.user_thread_stats enable row level security;

create policy "user_thread_stats_select_own" on public.user_thread_stats
  for select using (auth.uid() = user_id);
create policy "user_thread_stats_insert_service" on public.user_thread_stats
  for insert with check (true);
create policy "user_thread_stats_update_service" on public.user_thread_stats
  for update using (true);

-- 8. RPC: cosine similarity search for matching entries
create or replace function match_entries(
  query_embedding extensions.vector(1536),
  match_user_id uuid,
  exclude_entry_id uuid,
  min_day_gap int default 7,
  similarity_threshold float default 0.78,
  match_count int default 15
)
returns table (
  id uuid,
  title text,
  body text,
  ai_enhanced_body text,
  created_at timestamptz,
  entry_date text,
  similarity float
)
language sql stable
as $$
  select
    e.id,
    e.title,
    e.body,
    e.ai_enhanced_body,
    e.created_at,
    e.entry_date,
    (1 - (e.embedding <=> query_embedding))::float as similarity
  from public.entries e
  where e.user_id = match_user_id
    and e.id != exclude_entry_id
    and e.embedding is not null
    and e.created_at < now() - make_interval(days => min_day_gap)
    and (1 - (e.embedding <=> query_embedding)) > similarity_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- 9. RPC: atomically increment thread count (upsert)
create or replace function increment_thread_count(p_user_id uuid)
returns void
language plpgsql security definer
as $$
begin
  insert into public.user_thread_stats (user_id, total_connections, last_analyzed_at)
  values (p_user_id, 1, now())
  on conflict (user_id)
  do update set
    total_connections = user_thread_stats.total_connections + 1,
    last_analyzed_at = now();
end;
$$;

-- 10. RPC: batch similarity search using stored embedding from an entry_id
create or replace function match_entries_by_id(
  source_entry_id uuid,
  match_user_id uuid,
  min_day_gap int default 7,
  similarity_threshold float default 0.78,
  match_count int default 15
)
returns table (
  id uuid,
  title text,
  body text,
  ai_enhanced_body text,
  created_at timestamptz,
  entry_date text,
  similarity float
)
language sql stable
as $$
  select
    e.id,
    e.title,
    e.body,
    e.ai_enhanced_body,
    e.created_at,
    e.entry_date,
    (1 - (e.embedding <=> src.embedding))::float as similarity
  from public.entries e
  cross join (select embedding from public.entries where id = source_entry_id) src
  where e.user_id = match_user_id
    and e.id != source_entry_id
    and e.embedding is not null
    and src.embedding is not null
    and e.created_at < now() - make_interval(days => min_day_gap)
    and (1 - (e.embedding <=> src.embedding)) > similarity_threshold
  order by e.embedding <=> src.embedding
  limit match_count;
$$;

-- 11. Schedule nightly batch cron (2am UTC — adjust for local time handling in function)
select cron.schedule(
  'cron-threads-nightly',
  '0 2 * * *',
  $$
  select
    net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/cron-threads-nightly',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
