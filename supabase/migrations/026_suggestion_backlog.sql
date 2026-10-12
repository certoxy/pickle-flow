-- Allow suggestions without an immediate donation and expose a managed admin backlog.

alter table public.app_improvement_suggestions
  alter column status set default 'backlog';

alter table public.app_improvement_suggestions
  drop constraint if exists app_improvement_suggestions_status_check,
  drop constraint if exists app_improvement_suggestions_payment_provider_check,
  drop constraint if exists app_improvement_suggestions_payment_amount_check;

update public.app_improvement_suggestions set status = 'backlog' where status = 'new';

alter table public.app_improvement_suggestions
  add constraint app_improvement_suggestions_status_check
    check (status in ('backlog', 'reviewing', 'planned', 'declined', 'completed')),
  add constraint app_improvement_suggestions_payment_provider_check
    check (payment_provider in ('paypal', 'gcash', 'maya', 'later')),
  add constraint app_improvement_suggestions_payment_amount_check check (
    (payment_provider = 'paypal' and donation_amount_usd >= 10 and donation_amount_php is null)
    or
    (payment_provider in ('gcash', 'maya') and donation_amount_php >= 580 and payment_proof_path is not null)
    or
    (payment_provider = 'later' and donation_amount_usd is null and donation_amount_php is null and payment_proof_path is null)
  );

drop policy if exists "Admins view all suggestions" on public.app_improvement_suggestions;
create policy "Admins view all suggestions" on public.app_improvement_suggestions
for select to authenticated using (public.is_platform_admin());

drop policy if exists "Admins update suggestion status" on public.app_improvement_suggestions;
create policy "Admins update suggestion status" on public.app_improvement_suggestions
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());

grant update on public.app_improvement_suggestions to authenticated;
