-- ============================================================
-- GRAPH: Constrain primary_theme and primary_emotion to fixed palettes.
--
-- Rationale: the graph colors nodes by theme (primary) or emotion
-- (fallback). The LLM was previously emitting free-form phrases, which
-- made a coherent color mapping impossible. This migration:
--   1. Nulls out any existing off-palette values (they'll be re-extracted
--      by the backfill edge function against the new constrained prompt).
--   2. Adds CHECK constraints so bad output gets rejected loudly.
--   3. Adds a lookup index for theme/emotion filtering from the graph.
-- ============================================================

-- 1. Null out off-palette rows so the backfill sweep picks them up.
--    (Embeddings are untouched — backfill only re-runs metadata extraction.)
update public.entry_metadata
set primary_theme = null
where primary_theme is not null
  and primary_theme not in (
    'belonging', 'loss', 'pride', 'family', 'work',
    'change', 'place', 'growth', 'joy', 'uncertain'
  );

update public.entry_metadata
set primary_emotion = null
where primary_emotion is not null
  and primary_emotion not in (
    'joy', 'sadness', 'anger', 'fear',
    'love', 'longing', 'pride', 'peace'
  );

-- 2. Enforce palette at the DB boundary.
alter table public.entry_metadata
  add constraint entry_metadata_primary_theme_chk
  check (
    primary_theme is null
    or primary_theme in (
      'belonging', 'loss', 'pride', 'family', 'work',
      'change', 'place', 'growth', 'joy', 'uncertain'
    )
  );

alter table public.entry_metadata
  add constraint entry_metadata_primary_emotion_chk
  check (
    primary_emotion is null
    or primary_emotion in (
      'joy', 'sadness', 'anger', 'fear',
      'love', 'longing', 'pride', 'peace'
    )
  );

-- 3. Graph filter queries hit (user_id, primary_theme) and
--    (user_id, primary_emotion) — index both.
create index if not exists entry_metadata_user_theme_idx
  on public.entry_metadata (user_id, primary_theme);

create index if not exists entry_metadata_user_emotion_idx
  on public.entry_metadata (user_id, primary_emotion);
