alter table public.events
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists retention_extended_until date;

create or replace function public.delete_expired_event_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.events
  where current_date > coalesce(retention_extended_until, event_date + 15);
end;
$$;

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'pickleflow-delete-expired-events',
  '30 2 * * *',
  'select public.delete_expired_event_data();'
)
where not exists (
  select 1 from cron.job where jobname = 'pickleflow-delete-expired-events'
);
