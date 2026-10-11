create table if not exists public.court_scoring_access (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  court_id uuid not null references public.event_courts(id) on delete cascade,
  access_token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (court_id)
);

alter table public.court_scoring_access enable row level security;

drop policy if exists "Organizers manage court scoring access" on public.court_scoring_access;
create policy "Organizers manage court scoring access"
on public.court_scoring_access for all to authenticated
using (public.organizer_owns_event(event_id))
with check (public.organizer_owns_event(event_id));

create or replace function public.create_court_scoring_access(p_court_id uuid)
returns table(access_token uuid, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  target_event_id uuid;
begin
  select event_id into target_event_id from public.event_courts where id = p_court_id;
  if target_event_id is null or not public.organizer_owns_event(target_event_id) then
    raise exception 'You do not have access to this court';
  end if;

  return query
  insert into public.court_scoring_access as access
    (event_id, court_id, access_token, expires_at, revoked_at, created_by)
  values
    (target_event_id, p_court_id, gen_random_uuid(), now() + interval '24 hours', null, auth.uid())
  on conflict (court_id) do update set
    access_token = case
      when access.expires_at <= now() or access.revoked_at is not null then gen_random_uuid()
      else access.access_token
    end,
    expires_at = now() + interval '24 hours',
    revoked_at = null,
    created_by = auth.uid()
  returning access.access_token, access.expires_at;
end;
$$;

create or replace function public.get_court_scoring_view(p_token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  access_row public.court_scoring_access%rowtype;
  result jsonb;
begin
  select * into access_row
  from public.court_scoring_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if not found then raise exception 'This scoring link is invalid or has expired'; end if;

  select jsonb_build_object(
    'event_name', e.name,
    'court_name', c.name,
    'expires_at', access_row.expires_at,
    'game', coalesce((
      select jsonb_build_object(
        'id', g.id, 'game_number', g.game_number, 'status', g.status,
        'points_to_win', g.points_to_win,
        'team_one_score', coalesce(g.team_one_score, 0),
        'team_two_score', coalesce(g.team_two_score, 0),
        'team_one', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 1), '[]'::jsonb),
        'team_two', coalesce((select jsonb_agg(pr.full_name order by gp.id)
          from public.game_players gp join public.player_registrations pr on pr.id = gp.player_registration_id
          where gp.game_id = g.id and gp.team_number = 2), '[]'::jsonb)
      ) from public.games g
      where g.court_id = c.id and g.status = 'playing'
      order by g.started_at desc nulls last, g.game_number desc limit 1
    ), 'null'::jsonb),
    'next_game', coalesce((
      select jsonb_build_object('game_number', g.game_number)
      from public.games g where g.court_id = c.id and g.status = 'queued'
      order by g.game_number limit 1
    ), 'null'::jsonb)
  ) into result
  from public.event_courts c join public.events e on e.id = c.event_id
  where c.id = access_row.court_id;
  return result;
end;
$$;

create or replace function public.update_court_score(
  p_token uuid, p_game_id uuid, p_team_one_score integer, p_team_two_score integer
) returns void language plpgsql security definer set search_path = public as $$
declare target_court_id uuid;
begin
  if p_team_one_score < 0 or p_team_two_score < 0 then raise exception 'Scores cannot be negative'; end if;
  select court_id into target_court_id from public.court_scoring_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if target_court_id is null then raise exception 'This scoring link is invalid or has expired'; end if;
  update public.games set team_one_score = p_team_one_score, team_two_score = p_team_two_score
  where id = p_game_id and court_id = target_court_id and status = 'playing';
  if not found then raise exception 'This game is no longer active on this court'; end if;
end;
$$;

revoke all on function public.get_court_scoring_view(uuid) from public;
revoke all on function public.update_court_score(uuid, uuid, integer, integer) from public;
grant execute on function public.create_court_scoring_access(uuid) to authenticated;
grant execute on function public.get_court_scoring_view(uuid) to anon, authenticated;
grant execute on function public.update_court_score(uuid, uuid, integer, integer) to anon, authenticated;

