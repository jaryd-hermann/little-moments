-- ============================================================
-- RESONANCE OPTIONS REFRESH
-- Keep existing selections intact, but show a new option set
-- for users going forward.
-- ============================================================

-- Expand allowed tags so new options can coexist with legacy rows.
alter table public.purpose_options
  drop constraint if exists purpose_options_tag_check;

alter table public.purpose_options
  add constraint purpose_options_tag_check
  check (
    tag in (
      -- legacy tags (kept for existing users)
      'time',
      'storytelling',
      'habit',
      'presence',
      'memory',
      'legacy',
      -- new tags
      'self',
      'family'
    )
  );

-- Add the new resonance options for future onboarding users.
insert into public.purpose_options (label, tag, sort_order)
values
  ('I feel like days are blurring together', 'time', 101),
  ('I want to notice little moments in my day better', 'presence', 102),
  ('I can''t remember what happened last week', 'memory', 103),
  ('I want a low-effort journaling habit that actually sticks', 'habit', 104),
  ('I want to record my memories for myself', 'self', 105),
  ('I want to archive my memories for my family', 'family', 106)
on conflict do nothing;
