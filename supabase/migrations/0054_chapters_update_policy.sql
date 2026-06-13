-- ============================================================
-- Allow the chapter owner to UPDATE their own chapter rows.
--
-- Bug: `lib/views.ts → markChapterViewed` does
--   update chapters set viewed_at = now() where id = ? and viewed_at is null
-- to flip the "unseen" bit when the user opens a chapter. Until this
-- migration, `public.chapters` only had a SELECT policy
-- (`chapters_select_own` from 0010) — RLS therefore silently filtered
-- the UPDATE to zero rows. The client saw `data = null` (which it
-- correctly treats as "already viewed, nothing to do") and never
-- persisted `viewed_at`. On the next cold start, `useUnseenBootstrap`
-- re-queried `viewed_at IS NULL` and the chapter was marked unseen
-- again — exactly the "I viewed it but it stays unseen" loop the user
-- reported.
--
-- This mirrors the existing `threads_update_own` policy from 0023, which
-- is why threads do NOT exhibit the same bug.
--
-- The `with check` clause prevents the owner from re-pointing a chapter
-- at a different user (`user_id` is immutable from the client).
-- Server-side writes (`generate-chapter`, `cron-chapters`,
-- `renumber-chapters`, etc.) use the service-role key and bypass RLS,
-- so this policy does NOT widen what those code paths can do.
-- ============================================================

create policy "chapters_update_own" on public.chapters
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
