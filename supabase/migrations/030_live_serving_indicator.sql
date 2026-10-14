alter table public.games
  add column if not exists serving_team integer not null default 1,
  add column if not exists serve_number integer not null default 1,
  add column if not exists service_tracking_active boolean not null default false;

alter table public.games drop constraint if exists games_serving_team_check;
alter table public.games add constraint games_serving_team_check check (serving_team in (1, 2));
alter table public.games drop constraint if exists games_serve_number_check;
alter table public.games add constraint games_serve_number_check check (serve_number in (1, 2));

create or replace function public.update_court_service(
  p_token uuid, p_game_id uuid, p_serving_team integer, p_serve_number integer
) returns void language plpgsql security definer set search_path = public as $$
declare target_court_id uuid;
begin
  if p_serving_team not in (1, 2) or p_serve_number not in (1, 2) then
    raise exception 'Invalid serving position';
  end if;
  select court_id into target_court_id from public.court_scoring_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if target_court_id is null then raise exception 'This scoring link is invalid or has expired'; end if;
  update public.games set serving_team = p_serving_team, serve_number = p_serve_number,
    service_tracking_active = true
  where id = p_game_id and court_id = target_court_id and status = 'playing';
  if not found then raise exception 'This game is no longer active on this court'; end if;
end;
$$;

revoke all on function public.update_court_service(uuid, uuid, integer, integer) from public;
grant execute on function public.update_court_service(uuid, uuid, integer, integer) to anon, authenticated;

create or replace function public.get_court_scoring_view(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare access_row public.court_scoring_access%rowtype; result jsonb;
begin
  select * into access_row from public.court_scoring_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if not found then raise exception 'This scoring link is invalid or has expired'; end if;
  select jsonb_build_object(
    'event_name', e.name, 'court_name', c.name, 'expires_at', access_row.expires_at,
    'game', coalesce((select jsonb_build_object(
      'id', g.id, 'game_number', g.game_number, 'status', g.status,
      'points_to_win', g.points_to_win,
      'team_one_score', coalesce(g.team_one_score, 0),
      'team_two_score', coalesce(g.team_two_score, 0),
      'serving_team', g.serving_team, 'serve_number', g.serve_number,
      'service_tracking_active', g.service_tracking_active,
      'team_one', coalesce((select jsonb_agg(pr.full_name order by gp.id)
        from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
        where gp.game_id = g.id and gp.team_number = 1), '[]'::jsonb),
      'team_two', coalesce((select jsonb_agg(pr.full_name order by gp.id)
        from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
        where gp.game_id = g.id and gp.team_number = 2), '[]'::jsonb)
    ) from public.games g where g.court_id = c.id and g.status = 'playing'
      order by g.started_at desc nulls last, g.game_number desc limit 1), 'null'::jsonb),
    'next_game', coalesce((select jsonb_build_object('game_number', g.game_number)
      from public.games g where g.court_id = c.id and g.status = 'queued'
      order by g.game_number limit 1), 'null'::jsonb)
  ) into result from public.event_courts c join public.events e on e.id = c.event_id
  where c.id = access_row.court_id;
  return result;
end;
$$;

revoke all on function public.get_court_scoring_view(uuid) from public;
grant execute on function public.get_court_scoring_view(uuid) to anon, authenticated;

create or replace function public.get_event_display_view(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare access_row public.event_display_access%rowtype; result jsonb;
begin
  select * into access_row from public.event_display_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if not found then raise exception 'This Match Board link is invalid or has expired'; end if;
  select jsonb_build_object(
    'event_name', e.name, 'venue', e.venue, 'points_to_win', e.points_to_win,
    'expires_at', access_row.expires_at,
    'courts', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'status', c.status,
      'game', (select jsonb_build_object(
        'id', g.id, 'game_number', g.game_number,
        'team_one_score', coalesce(g.team_one_score, 0),
        'team_two_score', coalesce(g.team_two_score, 0),
        'serving_team', g.serving_team, 'serve_number', g.serve_number,
        'service_tracking_active', g.service_tracking_active,
        'team_one', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 1), '[]'::jsonb),
        'team_two', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 2), '[]'::jsonb)
      ) from public.games g where g.court_id = c.id and g.status = 'playing'
        order by g.started_at desc nulls last limit 1),
      'next_game', (select jsonb_build_object(
        'game_number', g.game_number,
        'team_one', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 1), '[]'::jsonb),
        'team_two', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 2), '[]'::jsonb)
      ) from public.games g where g.court_id = c.id and g.status = 'queued'
        order by g.game_number limit 1)
    ) order by c.created_at) from public.event_courts c
      where c.event_id = e.id and c.status <> 'disabled'), '[]'::jsonb),
    'next_match', (select jsonb_build_object(
      'game_number', g.game_number,
      'team_one', coalesce((select jsonb_agg(pr.full_name order by gp.id)
        from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
        where gp.game_id = g.id and gp.team_number = 1), '[]'::jsonb),
      'team_two', coalesce((select jsonb_agg(pr.full_name order by gp.id)
        from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
        where gp.game_id = g.id and gp.team_number = 2), '[]'::jsonb)
      ) from public.games g where g.event_id = e.id and g.status = 'queued' and g.court_id is null
      order by g.game_number limit 1),
    'waiting', coalesce((select jsonb_agg(jsonb_build_object(
      'position', q.position, 'name', pr.full_name) order by q.position, q.joined_at)
      from public.game_queue q join public.player_registrations pr on pr.id = q.player_registration_id
      where q.event_id = e.id and q.status = 'waiting'), '[]'::jsonb),
    'recent_games', coalesce((select jsonb_agg(recent.item order by recent.completed_at desc)
      from (select g.completed_at, jsonb_build_object(
        'game_number', g.game_number, 'court_name', coalesce(c.name, 'Court'),
        'team_one_score', g.team_one_score, 'team_two_score', g.team_two_score,
        'winner_team', g.winner_team,
        'winners', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = g.winner_team), '[]'::jsonb)
      ) item from public.games g left join public.event_courts c on c.id = g.court_id
      where g.event_id = e.id and g.status = 'completed'
      order by g.completed_at desc limit 5) recent), '[]'::jsonb)
  ) into result from public.events e where e.id = access_row.event_id;
  return result;
end;
$$;

revoke all on function public.get_event_display_view(uuid) from public;
grant execute on function public.get_event_display_view(uuid) to anon, authenticated;
