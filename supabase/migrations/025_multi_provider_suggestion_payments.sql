-- Support PayPal, GCash, and Maya donations for app improvement suggestions.

alter table public.app_improvement_suggestions
  add column if not exists payment_provider text not null default 'paypal',
  add column if not exists payment_reference text,
  add column if not exists donation_amount_php numeric(10,2),
  add column if not exists payment_proof_path text;

alter table public.app_improvement_suggestions
  alter column donation_amount_usd drop not null,
  alter column paypal_order_id drop not null;

alter table public.app_improvement_suggestions
  drop constraint if exists app_improvement_suggestions_donation_amount_usd_check,
  drop constraint if exists app_improvement_suggestions_payment_provider_check,
  drop constraint if exists app_improvement_suggestions_payment_amount_check;

alter table public.app_improvement_suggestions
  add constraint app_improvement_suggestions_payment_provider_check
    check (payment_provider in ('paypal', 'gcash', 'maya')),
  add constraint app_improvement_suggestions_payment_amount_check check (
    (payment_provider = 'paypal' and donation_amount_usd >= 10 and donation_amount_php is null)
    or
    (payment_provider in ('gcash', 'maya') and donation_amount_php >= 580 and payment_proof_path is not null)
  );

update public.app_improvement_suggestions
set payment_provider = 'paypal', payment_reference = paypal_order_id
where payment_reference is null and paypal_order_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suggestion-payment-proofs', 'suggestion-payment-proofs', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organizers upload suggestion payment proof" on storage.objects;
create policy "Organizers upload suggestion payment proof" on storage.objects
for insert to authenticated with check (
  bucket_id = 'suggestion-payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Organizers and admins view suggestion payment proof" on storage.objects;
create policy "Organizers and admins view suggestion payment proof" on storage.objects
for select to authenticated using (
  bucket_id = 'suggestion-payment-proofs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
);
