-- Expand marketing story decks to 8 slides (philosophy rows share the canonical deck).
-- Memory Jog row: original six slides plus two in-app habit slides.

WITH philosophy_deck AS (
  SELECT $phil$
[
  {"emoji":"📝","title":"Homework for Life","body":"Matthew Dicks assigns his students one task: find the most story-worthy moment of every single day."},
  {"emoji":"🔍","title":"The 1-Degree Turn","body":"The best stories aren't big explosions. They're small shifts. A glance. A single word. A moment you almost missed."},
  {"emoji":"⏰","title":"Five Minutes a Night","body":"That's all it takes. One sentence. One memory. One little moment before you sleep."},
  {"emoji":"🧵","title":"Build a Tapestry","body":"Over months and years, your little moments weave into something extraordinary — the story of your life."},
  {"emoji":"🎤","title":"Stories Are Everywhere","body":"You already have hundreds of stories inside you. Homework for Life is the practice of finding them."},
  {"emoji":"💡","title":"Dig Deeper","body":"Our AI asks the questions great storytellers ask. Who was there? What did you feel? What changed?"},
  {"emoji":"🔥","title":"Memory Jog","body":"Set a timer. Start with a word. Don't stop. This is Matthew's technique for unlocking buried memories."},
  {"emoji":"🎬","title":"Your Story Archive","body":"Every entry joins your cinematic timeline. Scroll back through your life. Your stories are waiting."}
]
$phil$::jsonb AS slides
)
UPDATE public.marketing_stories m
SET slides = (SELECT slides FROM philosophy_deck),
    updated_at = now()
WHERE m.category = 'philosophy';

UPDATE public.marketing_stories
SET slides = $mj$
[
  {"emoji":"🔥","title":"What is Memory Jog?","body":"A timed free-writing exercise inspired by Matthew Dicks. Start with a word, write for 2 minutes without stopping."},
  {"emoji":"⏱","title":"The 2-Minute Race","body":"You'll get a random word to spark a memory. Hit begin, and write whatever comes to mind. Don't edit. Don't pause. Just go."},
  {"emoji":"🧠","title":"Why It Works","body":"Free-writing bypasses your inner critic. Memories you forgot you had start tumbling out — that's where the best stories hide."},
  {"emoji":"🎲","title":"Shuffle for Surprise","body":"Don't connect with a word? Shuffle it. The randomness is the point — unexpected prompts unlock unexpected memories."},
  {"emoji":"✨","title":"Refine or Keep Raw","body":"When time's up, post your writing as-is or use Dig Deeper to shape it into a polished story. Both are valuable."},
  {"emoji":"📖","title":"Build the Habit","body":"The more you jog, the more you remember. Each session trains your brain to notice and hold onto the little moments."},
  {"emoji":"📱","title":"Part of your archive","body":"Save raw sprints as moments or polish them with Dig Deeper — either way they land in your story timeline."},
  {"emoji":"🌙","title":"A ritual that sticks","body":"Stack Memory Jog with a wind-down you already do. Small repeats train your eye for the next story-worthy beat."}
]
$mj$::jsonb,
    updated_at = now()
WHERE slug = 'memory-jog';
