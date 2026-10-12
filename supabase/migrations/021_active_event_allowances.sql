-- Active-event allowance and donation-backed upgrade requests.
-- Active means registration is open and the event date is today or later.

alter table public.organizer_profiles
  add column if not exists additional_active_events integer not null default 0
  check (additional_active_events >= 0);

create table if not exists public.platform_admins (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
insert into public.platform_admins(email) values
  ('certoxy@gmail.com'),
  ('ocayglenn75@gmail.com')
on conflict (email) do nothing;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_admins
    where lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );
$$;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "Admins view their admin record" on public.platform_admins;
create policy "Admins view their admin record" on public.platform_admins
for select to authenticated using (lower(email) = lower(coalesce(auth.jwt()->>'email', '')));
grant select on public.platform_admins to authenticated;

create table if not exists public.active_event_upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  requested_events integer not null check (requested_events in (2, 5, 10)),
  donation_amount_usd numeric(10,2) not null,
  paypal_order_id text not null unique,
  paypal_capture_id text,
  proof_method text not null check (proof_method in ('upload', 'email')),
  proof_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint active_event_upgrade_package_check check (
    (requested_events = 2 and donation_amount_usd = 10) or
    (requested_events = 5 and donation_amount_usd = 25) or
    (requested_events = 10 and donation_amount_usd = 50)
  ),
  constraint active_event_upgrade_proof_check check (
    proof_method = 'email' or proof_path is not null
  )
);
alter table public.active_event_upgrade_requests enable row level security;

drop policy if exists "Organizers create upgrade requests" on public.active_event_upgrade_requests;
create policy "Organizers create upgrade requests" on public.active_event_upgrade_requests
for insert to authenticated with check (organizer_user_id = auth.uid() and status = 'pending');
drop policy if exists "Organizers view upgrade requests" on public.active_event_upgrade_requests;
create policy "Organizers view upgrade requests" on public.active_event_upgrade_requests
for select to authenticated using (organizer_user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "Admins update upgrade requests" on public.active_event_upgrade_requests;
create policy "Admins update upgrade requests" on public.active_event_upgrade_requests
for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
grant select, insert, update on public.active_event_upgrade_requests to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-upgrade-proofs', 'event-upgrade-proofs', false, 5242880,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Organizers upload event upgrade proof" on storage.objects;
create policy "Organizers upload event upgrade proof" on storage.objects
for insert to authenticated with check (
  bucket_id = 'event-upgrade-proofs' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Organizers and admins view event upgrade proof" on storage.objects;
create policy "Organizers and admins view event upgrade proof" on storage.objects
for select to authenticated using (
  bucket_id = 'event-upgrade-proofs'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_platform_admin())
);

create or replace function public.active_event_allowance(target_user_id uuid default auth.uid())
returns table(active_count integer, event_limit integer, additional_events integer)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::integer from public.events
      where organizer_user_id = target_user_id and status = 'open' and event_date >= current_date),
    3 + coalesce((select additional_active_events from public.organizer_profiles where user_id = target_user_id), 0),
    coalesce((select additional_active_events from public.organizer_profiles where user_id = target_user_id), 0)
  where target_user_id = auth.uid() or public.is_platform_admin();
$$;
grant execute on function public.active_event_allowance(uuid) to authenticated;

create or replace function public.enforce_organizer_event_quota()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare current_active integer; allowed_active integer;
begin
  if auth.uid() is null or auth.uid() <> new.organizer_user_id then
    raise exception 'You do not have permission to save this event.';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your email before creating an event.';
  end if;
  if new.registration_limit is null or new.registration_limit > 200 then
    raise exception 'The free version allows up to 200 players per event.';
  end if;
  if new.status = 'open' and new.event_date >= current_date
     and (tg_op = 'INSERT' or old.status is distinct from 'open' or old.event_date < current_date) then
    select count(*)::integer into current_active from public.events
    where organizer_user_id = new.organizer_user_id and status = 'open'
      and event_date >= current_date and id is distinct from new.id;
    select 3 + coalesce(additional_active_events, 0) into allowed_active
    from public.organizer_profiles where user_id = new.organizer_user_id;
    if current_active >= coalesce(allowed_active, 3) then
      raise exception 'Active event limit reached. Request additional active events to continue.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_organizer_event_quota_before_insert on public.events;
drop trigger if exists enforce_organizer_event_quota_before_save on public.events;
create trigger enforce_organizer_event_quota_before_save
before insert or update of status, event_date on public.events
for each row execute procedure public.enforce_organizer_event_quota();

create or replace function public.review_active_event_upgrade(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare request_row public.active_event_upgrade_requests%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
  select * into request_row from public.active_event_upgrade_requests
  where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'This request is no longer pending.'; end if;
  update public.active_event_upgrade_requests set
    status = case when p_approve then 'approved' else 'declined' end,
    reviewed_by = auth.jwt()->>'email', reviewed_at = now()
  where id = p_request_id;
  if p_approve then
    update public.organizer_profiles set
      additional_active_events = additional_active_events + request_row.requested_events
    where user_id = request_row.organizer_user_id;
  end if;
end;
$$;
grant execute on function public.review_active_event_upgrade(uuid, boolean) to authenticated;
