-- Allow `system` as a valid `color_theme` and make it the new default for
-- new profiles. Existing rows are left untouched (still `light` / `dark`),
-- so anyone who has already chosen a side keeps their choice. New users
-- start in "follow the device" mode unless onboarding writes another value.

alter table public.profiles
  drop constraint if exists profiles_color_theme_check;

alter table public.profiles
  add constraint profiles_color_theme_check
  check (color_theme in ('light', 'dark', 'system'));

alter table public.profiles
  alter column color_theme set default 'system';
