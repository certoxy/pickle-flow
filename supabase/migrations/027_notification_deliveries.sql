-- Idempotency log for branded transactional email notifications.

create table if not exists public.email_notification_deliveries (
  event_key text primary key,
  recipient text not null,
  notification_type text not null,
  provider_message_id text,
  created_at timestamptz not null default now()
);

alter table public.email_notification_deliveries enable row level security;
revoke all on public.email_notification_deliveries from anon, authenticated;
