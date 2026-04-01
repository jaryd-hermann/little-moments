-- ============================================================
-- MARKETING STORIES (in-app story decks; public read)
-- ============================================================
create table public.marketing_stories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  category text not null
    check (category in ('philosophy', 'memory_jog')),
  card_title text not null,
  card_description text,
  slides jsonb not null
    check (jsonb_typeof(slides) = 'array' and jsonb_array_length(slides) > 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create index marketing_stories_category_sort_idx
  on public.marketing_stories (category, sort_order);

alter table public.marketing_stories enable row level security;

create policy "Marketing stories are world-readable"
  on public.marketing_stories
  for select
  to anon, authenticated
  using (true);

-- Philosophy: four distinct decks (titles match in-app cards)
insert into public.marketing_stories (slug, category, card_title, card_description, slides, sort_order) values
(
  'philosophy-change-lens',
  'philosophy',
  'Change the way you look at your life',
  'Homework for Life and why the smallest shifts carry the story.',
  '[
    {"emoji":"📝","title":"Homework for Life","body":"Matthew Dicks assigns his students one task: find the most story-worthy moment of every single day."},
    {"emoji":"🔍","title":"The 1-Degree Turn","body":"The best stories aren''t big explosions. They''re small shifts. A glance. A single word. A moment you almost missed."}
  ]'::jsonb,
  1
),
(
  'philosophy-storytelling',
  'philosophy',
  'Develop the greatest skill: storytelling',
  'Practice noticing narratives everywhere and going deeper with questions.',
  '[
    {"emoji":"🎤","title":"Stories Are Everywhere","body":"You already have hundreds of stories inside you. Homework for Life is the practice of finding them."},
    {"emoji":"💡","title":"Dig Deeper","body":"Our AI asks the questions great storytellers ask. Who was there? What did you feel? What changed?"}
  ]'::jsonb,
  2
),
(
  'philosophy-everyday-moments',
  'philosophy',
  'Finding stories in the everyday',
  'Your archive grows from ordinary days — that''s where the plot lives.',
  '[
    {"emoji":"🧵","title":"Build a Tapestry","body":"Over months and years, your little moments weave into something extraordinary — the story of your life."},
    {"emoji":"🎬","title":"Your Story Archive","body":"Every entry joins your cinematic timeline. Scroll back through your life. Your stories are waiting."}
  ]'::jsonb,
  3
),
(
  'philosophy-daily-habit',
  'philosophy',
  'Do it easy. Do it daily',
  'A few minutes a night and Memory Jog as a lever for habit.',
  '[
    {"emoji":"⏰","title":"Five Minutes a Night","body":"That''s all it takes. One sentence. One memory. One little moment before you sleep."},
    {"emoji":"🔥","title":"Memory Jog","body":"Set a timer. Start with a word. Don''t stop. This is Matthew''s technique for unlocking buried memories."}
  ]'::jsonb,
  4
),
(
  'memory-jog',
  'memory_jog',
  'The story behind Memory Jog',
  'How the race works and why timed free-writing unlocks memories.',
  '[
    {"emoji":"🔥","title":"What is Memory Jog?","body":"A timed free-writing exercise inspired by Matthew Dicks. Start with a word, write for 2 minutes without stopping."},
    {"emoji":"⏱","title":"The 2-Minute Race","body":"You''ll get a random word to spark a memory. Hit begin, and write whatever comes to mind. Don''t edit. Don''t pause. Just go."},
    {"emoji":"🧠","title":"Why It Works","body":"Free-writing bypasses your inner critic. Memories you forgot you had start tumbling out — that''s where the best stories hide."},
    {"emoji":"🎲","title":"Shuffle for Surprise","body":"Don''t connect with a word? Shuffle it. The randomness is the point — unexpected prompts unlock unexpected memories."},
    {"emoji":"✨","title":"Refine or Keep Raw","body":"When time''s up, post your writing as-is or use Dig Deeper to shape it into a polished story. Both are valuable."},
    {"emoji":"📖","title":"Build the Habit","body":"The more you jog, the more you remember. Each session trains your brain to notice and hold onto the little moments."}
  ]'::jsonb,
  5
);
