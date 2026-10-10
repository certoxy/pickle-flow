create table if not exists public.event_display_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.event_display_access enable row level security;

drop policy if exists "Organizers manage event display access" on public.event_display_access;
create policy "Organizers manage event display access"
on public.event_display_access for all to authenticated
using (public.organizer_owns_event(event_id))
with check (public.organizer_owns_event(event_id));

create or replace function public.create_event_display_access(p_event_id uuid)
returns table(access_token uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.organizer_owns_event(p_event_id) then
    raise exception 'You do not have access to this event';
  end if;
  return query
  insert into public.event_display_access as access
    (event_id, access_token, expires_at, revoked_at, created_by)
  values (p_event_id, gen_random_uuid(), now() + interval '7 days', null, auth.uid())
  on conflict (event_id) do update set
    access_token = case when access.expires_at <= now() or access.revoked_at is not null
      then gen_random_uuid() else access.access_token end,
    expires_at = now() + interval '7 days', revoked_at = null, created_by = auth.uid()
  returning access.access_token, access.expires_at;
end;
$$;

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
grant execute on function public.create_event_display_access(uuid) to authenticated;
grant execute on function public.get_event_display_view(uuid) to anon, authenticated;

