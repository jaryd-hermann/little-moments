-- Places join people and themes as a movie kind.
--
-- `entry_metadata.places` and `user_thread_stats.recurring_places` already
-- exist and are already populated by `canonicalize-people` — this only widens
-- the kind constraint so the unlock ledger can record them.

alter table public.movie_unlocks
  drop constraint movie_unlocks_kind_check;

alter table public.movie_unlocks
  add constraint movie_unlocks_kind_check
  check (kind in ('week', 'month', 'year', 'person', 'place', 'theme'));
