create table if not exists public.game_player_substitutions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  outgoing_player_registration_id uuid not null references public.player_registrations(id) on delete cascade,
  incoming_player_registration_id uuid not null references public.player_registrations(id) on delete cascade,
  team_number integer not null check (team_number in (1, 2)),
  substituted_at timestamptz not null default now(),
  substituted_by uuid not null default auth.uid() references auth.users(id) on delete cascade
);

alter table public.game_player_substitutions enable row level security;

drop policy if exists "Organizers view player substitutions" on public.game_player_substitutions;
create policy "Organizers view player substitutions"
on public.game_player_substitutions for select to authenticated
using (public.organizer_owns_event(event_id));

create or replace function public.substitute_game_player(
  target_game_id uuid,
  outgoing_player_id uuid,
  incoming_player_id uuid
)
returns public.game_player_substitutions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_game public.games%rowtype;
  target_slot public.game_players%rowtype;
  substitution public.game_player_substitutions%rowtype;
begin
  select * into target_game from public.games where id = target_game_id for update;
  if target_game.id is null or target_game.status not in ('queued', 'playing') then
    raise exception 'Only queued or active games allow substitutions.';
  end if;
  if not public.organizer_owns_event(target_game.event_id) then
    raise exception 'You do not have permission to manage this game.';
  end if;
  if outgoing_player_id = incoming_player_id then
    raise exception 'Choose a different substitute player.';
  end if;
  if not exists (
    select 1 from public.player_registrations
    where id = incoming_player_id and event_id = target_game.event_id
      and status <> 'cancelled' and checked_in_at is not null
  ) then
    raise exception 'The substitute must be a checked-in player for this event.';
  end if;
  if exists (
    select 1 from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.player_registration_id = incoming_player_id
      and g.event_id = target_game.event_id
      and g.status in ('queued', 'playing')
  ) then
    raise exception 'The substitute is already assigned to an active game.';
  end if;

  select * into target_slot from public.game_players
  where game_id = target_game_id and player_registration_id = outgoing_player_id
  for update;
  if target_slot.id is null then raise exception 'The outgoing player is not in this game.'; end if;

  insert into public.game_player_substitutions (
    event_id, game_id, outgoing_player_registration_id,
    incoming_player_registration_id, team_number
  ) values (
    target_game.event_id, target_game_id, outgoing_player_id,
    incoming_player_id, target_slot.team_number
  ) returning * into substitution;

  update public.game_players
  set player_registration_id = incoming_player_id
  where id = target_slot.id;

  update public.game_queue
  set status = 'removed'
  where event_id = target_game.event_id and player_registration_id = outgoing_player_id;

  insert into public.game_queue (event_id, player_registration_id, position, status, joined_at)
  values (target_game.event_id, incoming_player_id, 1, 'assigned', now())
  on conflict (event_id, player_registration_id)
  do update set status = 'assigned';

  return substitution;
end;
$$;

grant select on public.game_player_substitutions to authenticated;
grant execute on function public.substitute_game_player(uuid, uuid, uuid) to authenticated;
