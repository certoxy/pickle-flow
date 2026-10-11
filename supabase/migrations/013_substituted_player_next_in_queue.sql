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
  next_queue_position integer;
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

  select coalesce(min(position), 1) - 1 into next_queue_position
  from public.game_queue
  where event_id = target_game.event_id and status = 'waiting';

  insert into public.game_queue (
    event_id, player_registration_id, position, status, joined_at
  ) values (
    target_game.event_id, outgoing_player_id, next_queue_position, 'waiting', now()
  )
  on conflict (event_id, player_registration_id)
  do update set
    position = excluded.position,
    status = 'waiting',
    joined_at = excluded.joined_at;

  insert into public.game_queue (event_id, player_registration_id, position, status, joined_at)
  values (target_game.event_id, incoming_player_id, 1, 'assigned', now())
  on conflict (event_id, player_registration_id)
  do update set status = 'assigned';

  return substitution;
end;
$$;

grant execute on function public.substitute_game_player(uuid, uuid, uuid) to authenticated;
