-- ============================================================
-- EMAIL_SENDS
-- Tracks transactional/drip emails to avoid duplicates.
-- ============================================================
create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  email_key text not null,
  sent_at timestamptz default now(),
  unique(user_id, email_key)
);

alter table public.email_sends enable row level security;

create policy "Users can read own email sends"
  on public.email_sends for select
  using (auth.uid() = user_id);

-- ============================================================
-- WELCOME EMAIL TRIGGER
-- Fires send-welcome-email Edge Function on profile insert via pg_net.
-- Reuses the existing cron_evening_pushes_secret for auth.
-- ============================================================
create or replace function public.trigger_welcome_email()
returns trigger as $$
begin
  perform net.http_post(
    url := 'https://smwmkeoljqnifaoqzemb.supabase.co/functions/v1/send-welcome-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || coalesce(
        (select decrypted_secret
         from vault.decrypted_secrets
         where name = 'cron_evening_pushes_secret'
         limit 1),
        ''
      )
    ),
    body := jsonb_build_object('user_id', NEW.id, 'email', NEW.email, 'display_name', NEW.display_name)
  );
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_profile_created_send_welcome
  after insert on public.profiles
  for each row
  execute function public.trigger_welcome_email();
