alter table public.events drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check
  check (status in ('draft', 'open', 'closed', 'completed', 'cancelled'));

create table if not exists public.retention_extension_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  requested_until date not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (char_length(trim(reason)) >= 10)
);

alter table public.retention_extension_requests enable row level security;

drop policy if exists "Organizers view their retention requests" on public.retention_extension_requests;
create policy "Organizers view their retention requests"
on public.retention_extension_requests for select
to authenticated
using (organizer_user_id = auth.uid());

drop policy if exists "Organizers create retention requests" on public.retention_extension_requests;
create policy "Organizers create retention requests"
on public.retention_extension_requests for insert
to authenticated
with check (
  organizer_user_id = auth.uid()
  and exists (
    select 1 from public.events
    where events.id = retention_extension_requests.event_id
      and events.organizer_user_id = auth.uid()
      and requested_until > coalesce(events.retention_extended_until, events.event_date + 15)
  )
);

drop policy if exists "Organizers update registrations for their events" on public.player_registrations;
create policy "Organizers update registrations for their events"
on public.player_registrations for update
to authenticated
using (
  exists (
    select 1 from public.events
    where events.id = player_registrations.event_id
      and events.organizer_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.events
    where events.id = player_registrations.event_id
      and events.organizer_user_id = auth.uid()
  )
);

drop policy if exists "Anyone can register for an open event" on public.player_registrations;
create policy "Anyone can register for an open event"
on public.player_registrations for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.events
    where events.id = player_registrations.event_id
      and (
        events.status = 'open'
        or (events.organizer_user_id = auth.uid() and events.status in ('open', 'closed'))
      )
  )
);

create or replace function public.enforce_event_registration_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_limit integer;
  registration_count integer;
  event_status text;
  event_owner uuid;
begin
  select registration_limit, status, organizer_user_id
  into event_limit, event_status, event_owner
  from public.events
  where id = new.event_id
  for update;

  if event_status <> 'open' and not (event_owner = auth.uid() and event_status = 'closed') then
    raise exception 'This event is not accepting registrations.';
  end if;

  if new.status <> 'cancelled' and event_limit is not null then
    select count(*) into registration_count
    from public.player_registrations
    where event_id = new.event_id and status <> 'cancelled';

    if registration_count >= event_limit then
      raise exception 'Registration is full.';
    end if;
  end if;

  return new;
end;
$$;

grant select, insert on public.retention_extension_requests to authenticated;
grant update on public.player_registrations to authenticated;
