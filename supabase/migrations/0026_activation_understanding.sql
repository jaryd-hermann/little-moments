-- How well the user felt they understood LM after activation closing chat (yes / kind_of / no).
alter table public.profiles
  add column if not exists activation_lm_understanding text;

alter table public.profiles
  drop constraint if exists profiles_activation_lm_understanding_check;

alter table public.profiles
  add constraint profiles_activation_lm_understanding_check
  check (
    activation_lm_understanding is null
    or activation_lm_understanding in ('yes', 'kind_of', 'no')
  );

comment on column public.profiles.activation_lm_understanding is
  'Closing activation feedback: whether Ellie helped explain LM (yes | kind_of | no).';
