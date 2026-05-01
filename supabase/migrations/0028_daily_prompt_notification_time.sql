-- Daily new-prompt push time: align legacy profile defaults with morning delivery.
-- Server cron now reads profiles.notification_time for that push (see cron-evening-pushes).

update public.profiles
set notification_time = '06:00:00'::time
where notification_time::time in ('18:00:00'::time, '20:00:00'::time);
