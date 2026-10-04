create or replace function public.generate_event_code()
returns text
language sql
volatile
as $$
  select upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  event_code text not null unique default public.generate_event_code(),
  name text not null,
  description text,
  venue text not null,
  city text,
  event_date date not null,
  start_time time,
  registration_limit integer check (registration_limit is null or registration_limit > 0),
  status text not null default 'open' check (status in ('draft', 'open', 'closed', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  skill_level text not null default 'beginner' check (skill_level in ('beginner', 'intermediate', 'advanced', 'competitive')),
  status text not null default 'confirmed' check (status in ('confirmed', 'waitlisted', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (event_id, email)
);

alter table public.events enable row level security;
alter table public.player_registrations enable row level security;

drop policy if exists "Organizers manage their own events" on public.events;
create policy "Organizers manage their own events"
on public.events for all
to authenticated
using (auth.uid() = organizer_user_id)
with check (auth.uid() = organizer_user_id);

drop policy if exists "Anyone can view open events" on public.events;
create policy "Anyone can view open events"
on public.events for select
to anon, authenticated
using (status = 'open');

drop policy if exists "Organizers view registrations for their events" on public.player_registrations;
create policy "Organizers view registrations for their events"
on public.player_registrations for select
to authenticated
using (
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
      and events.status = 'open'
  )
);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute procedure public.set_updated_at();

grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant insert on public.player_registrations to anon, authenticated;
grant select on public.player_registrations to authenticated;
