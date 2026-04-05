-- Track deduplication for the new 7 AM morning prompt push
alter table public.profiles
  add column if not exists last_morning_push_local_date date;
