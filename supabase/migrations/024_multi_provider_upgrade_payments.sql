-- Support PayPal, GCash, and Maya for active-event allowance requests.

alter table public.active_event_upgrade_requests
  add column if not exists payment_provider text not null default 'paypal',
  add column if not exists payment_reference text,
  add column if not exists donation_amount_php numeric(10,2);

alter table public.active_event_upgrade_requests
  alter column paypal_order_id drop not null;

alter table public.active_event_upgrade_requests
  drop constraint if exists active_event_upgrade_payment_provider_check,
  drop constraint if exists active_event_upgrade_package_check;

alter table public.active_event_upgrade_requests
  add constraint active_event_upgrade_payment_provider_check
    check (payment_provider in ('paypal', 'gcash', 'maya')),
  add constraint active_event_upgrade_package_check check (
    (payment_provider = 'paypal' and donation_amount_php is null and (
      (requested_events = 2 and donation_amount_usd = 10) or
      (requested_events = 5 and donation_amount_usd = 25) or
      (requested_events = 10 and donation_amount_usd = 50)
    )) or
    (payment_provider in ('gcash', 'maya') and (
      (requested_events = 2 and donation_amount_php = 580) or
      (requested_events = 5 and donation_amount_php = 1450) or
      (requested_events = 10 and donation_amount_php = 2900)
    ))
  );

update public.active_event_upgrade_requests
set payment_reference = paypal_order_id
where payment_reference is null and paypal_order_id is not null;
