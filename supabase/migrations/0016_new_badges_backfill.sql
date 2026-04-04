-- Backfill badge_push_state for Story Builder, The Photographer, and 7-day streak
-- so existing qualifying users don't receive retroactive push notifications.

-- Story Builder: users with 10+ moments
update public.profiles p
set badge_push_state = coalesce(p.badge_push_state, '{}'::jsonb)
  || jsonb_build_object('story_builder', true)
where p.total_moments >= 10;

-- The Photographer: users who already have at least one image attached
update public.profiles p
set badge_push_state = coalesce(p.badge_push_state, '{}'::jsonb)
  || jsonb_build_object('the_photographer', true)
where exists (
  select 1 from public.entry_media em
  where em.user_id = p.id and em.media_type = 'image'
);

-- 7-day streak: users who have already hit a 7-day streak (current or historical)
update public.profiles p
set badge_push_state = coalesce(p.badge_push_state, '{}'::jsonb)
  || jsonb_build_object('streak_seven', true)
where p.longest_streak >= 7 or p.streak_count >= 7;
