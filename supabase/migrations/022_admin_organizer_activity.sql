-- Platform-admin organizer directory and activity summary.
-- The SECURITY DEFINER function is the only cross-organizer access path.

create or replace function public.admin_organizer_activity()
returns table (
  user_id uuid, email text, full_name text, organization_name text, phone text,
  city text, country text, profile_status text, joined_at timestamptz,
  last_sign_in_at timestamptz, last_activity_at timestamptz, event_count integer,
  active_event_count integer, upcoming_event_count integer, completed_event_count integer,
  player_count integer, game_count integer, completed_game_count integer,
  additional_active_events integer, event_limit integer, recent_events jsonb
)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access required.';
  end if;

  return query
  select p.user_id, u.email::text, p.full_name, p.organization_name, p.phone,
    p.city, p.country, p.status, p.created_at, u.last_sign_in_at,
    greatest(p.updated_at, u.last_sign_in_at, es.last_event_activity,
      rs.last_registration_activity, gs.last_game_activity),
    coalesce(es.event_count, 0)::integer,
    coalesce(es.active_event_count, 0)::integer,
    coalesce(es.upcoming_event_count, 0)::integer,
    coalesce(es.completed_event_count, 0)::integer,
    coalesce(rs.player_count, 0)::integer,
    coalesce(gs.game_count, 0)::integer,
    coalesce(gs.completed_game_count, 0)::integer,
    coalesce(p.additional_active_events, 0)::integer,
    (3 + coalesce(p.additional_active_events, 0))::integer,
    coalesce(recent.recent_events, '[]'::jsonb)
  from public.organizer_profiles p
  join auth.users u on u.id = p.user_id
  left join lateral (
    select count(*) as event_count,
      count(*) filter (where e.status = 'open' and e.event_date >= current_date) as active_event_count,
      count(*) filter (where e.event_date >= current_date and e.status not in ('completed', 'cancelled')) as upcoming_event_count,
      count(*) filter (where e.status = 'completed') as completed_event_count,
      max(e.updated_at) as last_event_activity
    from public.events e where e.organizer_user_id = p.user_id
  ) es on true
  left join lateral (
    select count(*) as player_count, max(pr.created_at) as last_registration_activity
    from public.player_registrations pr join public.events e on e.id = pr.event_id
    where e.organizer_user_id = p.user_id and pr.status <> 'cancelled'
  ) rs on true
  left join lateral (
    select count(*) as game_count,
      count(*) filter (where g.status = 'completed') as completed_game_count,
      max(coalesce(g.completed_at, g.started_at, g.created_at)) as last_game_activity
    from public.games g join public.events e on e.id = g.event_id
    where e.organizer_user_id = p.user_id
  ) gs on true
  left join lateral (
    select jsonb_agg(jsonb_build_object('id', activity.id, 'name', activity.name,
      'event_date', activity.event_date, 'status', activity.status,
      'players', activity.players, 'games', activity.games,
      'updated_at', activity.updated_at) order by activity.event_date desc, activity.updated_at desc) recent_events
    from (
      select e.id, e.name, e.event_date, e.status, e.updated_at,
        (select count(*)::integer from public.player_registrations pr
          where pr.event_id = e.id and pr.status <> 'cancelled') players,
        (select count(*)::integer from public.games g where g.event_id = e.id) games
      from public.events e where e.organizer_user_id = p.user_id
      order by e.event_date desc, e.updated_at desc limit 5
    ) activity
  ) recent on true
  order by greatest(p.updated_at, u.last_sign_in_at, es.last_event_activity,
    rs.last_registration_activity, gs.last_game_activity) desc nulls last, p.created_at desc;
end;
$$;

revoke all on function public.admin_organizer_activity() from public;
grant execute on function public.admin_organizer_activity() to authenticated;
