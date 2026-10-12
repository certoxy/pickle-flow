-- Public homepage impact counters. Only aggregate totals are exposed.

create or replace function public.platform_impact_counts()
returns table (organizers integer, events integer, players integer, games integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public.organizer_profiles where status = 'active'),
    (select count(*)::integer from public.events where status <> 'cancelled'),
    (select count(*)::integer from public.player_registrations where status <> 'cancelled'),
    (select count(*)::integer from public.games where status <> 'cancelled');
$$;

revoke all on function public.platform_impact_counts() from public;
grant execute on function public.platform_impact_counts() to anon, authenticated;
