-- ============================================================
-- RESONANCE OPTIONS — four choices, refreshed copy
-- Replaces the sort_order 101+ cohort from 0025.
-- ============================================================

delete from public.purpose_options
where sort_order >= 101 and sort_order <= 106;

insert into public.purpose_options (label, tag, sort_order)
values
  (
    'I feel like the days are blurring together, and I often forget what happened last week',
    'time',
    101
  ),
  (
    'I want an easy but meaningful journaling habit that actually sticks',
    'habit',
    102
  ),
  (
    'I want to notice the little moments in my life better',
    'presence',
    103
  ),
  (
    'I want to record my life story...the big & small moments',
    'memory',
    104
  );
