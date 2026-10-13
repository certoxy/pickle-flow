-- Preserve anonymous event history while purging operational and personal data.
-- The retention deadline is 72 hours after the event date unless an extension
-- has been approved. The existing daily pg_cron job calls this function.

create table if not exists public.event_archives (
  id uuid primary key default gen_random_uuid(),
  original_event_id uuid not null unique,
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  event_date date not null,
  player_count integer not null default 0 check (player_count >= 0),
  game_count integer not null default 0 check (game_count >= 0),
  archived_at timestamptz not null default now()
);

alter table public.event_archives enable row level security;

drop policy if exists "Organizers view their event archives" on public.event_archives;
create policy "Organizers view their event archives"
on public.event_archives for select to authenticated
using (organizer_user_id = auth.uid() or public.is_platform_admin());

revoke all on public.event_archives from anon;
grant select on public.event_archives to authenticated;

create or replace function public.delete_expired_event_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_archives (
    original_event_id,
    organizer_user_id,
    event_name,
    event_date,
    player_count,
    game_count,
    archived_at
  )
  select
    event_record.id,
    event_record.organizer_user_id,
    event_record.name,
    event_record.event_date,
    (select count(*)::integer
       from public.player_registrations registration
      where registration.event_id = event_record.id
        and registration.status <> 'cancelled'),
    (select count(*)::integer
       from public.games game
      where game.event_id = event_record.id
        and game.status <> 'cancelled'),
    now()
  from public.events event_record
  where now() >= case
    when event_record.retention_extended_until is not null
      then event_record.retention_extended_until::timestamp + interval '1 day'
    else event_record.event_date::timestamp + interval '72 hours'
  end
  on conflict (original_event_id) do nothing;

  delete from public.events event_record
  using public.event_archives archive
  where archive.original_event_id = event_record.id;

  delete from public.public_registration_rate_limits
  where window_started_at < now() - interval '2 days';

  delete from public.court_score_rate_limits
  where window_started_at < now() - interval '2 days';
end;
$$;

-- Process events that already passed their displayed retention date.
select public.delete_expired_event_data();
