alter table public.events
  add column if not exists game_format text not null default 'doubles'
    check (game_format in ('singles', 'doubles', 'mixed_doubles')),
  add column if not exists points_to_win integer not null default 11
    check (points_to_win between 1 and 99);

alter table public.player_registrations
  add column if not exists checked_in_at timestamptz;

create table if not exists public.event_courts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  status text not null default 'available' check (status in ('available', 'in_use', 'disabled')),
  created_at timestamptz not null default now(),
  unique (event_id, name)
);

create table if not exists public.game_queue (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  player_registration_id uuid not null references public.player_registrations(id) on delete cascade,
  position integer not null default 1,
  status text not null default 'waiting' check (status in ('waiting', 'assigned', 'removed')),
  joined_at timestamptz not null default now(),
  unique (event_id, player_registration_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  court_id uuid references public.event_courts(id) on delete set null,
  game_number integer not null,
  format text not null default 'doubles' check (format in ('singles', 'doubles', 'mixed_doubles')),
  points_to_win integer not null default 11,
  status text not null default 'queued' check (status in ('queued', 'playing', 'completed', 'cancelled')),
  team_one_score integer,
  team_two_score integer,
  winner_team integer check (winner_team in (1, 2)),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, game_number)
);

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_registration_id uuid not null references public.player_registrations(id) on delete cascade,
  team_number integer not null check (team_number in (1, 2)),
  unique (game_id, player_registration_id)
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  message_type text not null,
  recipient_email text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.event_courts enable row level security;
alter table public.game_queue enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.email_outbox enable row level security;

create or replace function public.organizer_owns_event(target_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events where id = target_event_id and organizer_user_id = auth.uid());
$$;

drop policy if exists "Organizers manage event courts" on public.event_courts;
create policy "Organizers manage event courts" on public.event_courts for all to authenticated
using (public.organizer_owns_event(event_id)) with check (public.organizer_owns_event(event_id));
drop policy if exists "Organizers manage game queue" on public.game_queue;
create policy "Organizers manage game queue" on public.game_queue for all to authenticated
using (public.organizer_owns_event(event_id)) with check (public.organizer_owns_event(event_id));
drop policy if exists "Organizers manage games" on public.games;
create policy "Organizers manage games" on public.games for all to authenticated
using (public.organizer_owns_event(event_id)) with check (public.organizer_owns_event(event_id));
drop policy if exists "Organizers manage game players" on public.game_players;
create policy "Organizers manage game players" on public.game_players for all to authenticated
using (exists (select 1 from public.games where games.id = game_players.game_id and public.organizer_owns_event(games.event_id)))
with check (exists (select 1 from public.games where games.id = game_players.game_id and public.organizer_owns_event(games.event_id)));

create or replace function public.queue_registration_confirmation()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_record public.events%rowtype;
begin
  if new.email is null then return new; end if;
  select * into event_record from public.events where id = new.event_id;
  insert into public.email_outbox (message_type, recipient_email, idempotency_key, payload)
  values ('registration_confirmation', new.email, 'registration-confirmation-' || new.id::text,
    jsonb_build_object('player_name', new.full_name, 'event_name', event_record.name,
      'event_code', event_record.event_code, 'event_date', event_record.event_date,
      'start_time', event_record.start_time, 'venue', event_record.venue, 'city', event_record.city))
  on conflict (idempotency_key) do nothing;
  return new;
end;
$$;

drop trigger if exists queue_registration_confirmation_after_insert on public.player_registrations;
create trigger queue_registration_confirmation_after_insert after insert on public.player_registrations
for each row execute procedure public.queue_registration_confirmation();

grant select, insert, update, delete on public.event_courts, public.game_queue, public.games, public.game_players to authenticated;
grant execute on function public.organizer_owns_event(uuid) to authenticated;
