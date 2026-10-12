-- PickleFlow cost and abuse controls.
-- Applies the 72-hour retention policy, public registration throttling,
-- scorer throttling, organizer quotas, and improvement suggestions.

alter table public.events
  add column if not exists completed_at timestamptz;

create or replace function public.set_event_completed_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    new.completed_at := now();
  elsif new.status is distinct from 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists events_set_completed_at on public.events;
create trigger events_set_completed_at
before update of status on public.events
for each row execute procedure public.set_event_completed_at();

-- Backfill completed events created before completed_at existed. The event day
-- ends at midnight in the database timezone and receives the full 72 hours.
update public.events
set completed_at = event_date::timestamp + interval '1 day'
where status = 'completed' and completed_at is null;

create or replace function public.delete_expired_event_data()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.events
  where status = 'completed'
    and now() >= case
      when retention_extended_until is not null
        then retention_extended_until::timestamp + interval '1 day'
      else coalesce(completed_at, event_date::timestamp + interval '1 day') + interval '72 hours'
    end;

  delete from public.public_registration_rate_limits
  where window_started_at < now() - interval '2 days';

  delete from public.court_score_rate_limits
  where window_started_at < now() - interval '2 days';
end;
$$;

create table if not exists public.public_registration_rate_limits (
  event_id uuid not null references public.events(id) on delete cascade,
  client_id uuid not null,
  window_started_at timestamptz not null default date_trunc('minute', now()),
  request_count integer not null default 1,
  primary key (event_id, client_id, window_started_at)
);
alter table public.public_registration_rate_limits enable row level security;
revoke all on public.public_registration_rate_limits from anon, authenticated;

create or replace function public.register_player(
  p_event_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_skill_level text default 'beginner',
  p_client_id uuid default null,
  p_website text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clean_name text := trim(coalesce(p_full_name, ''));
  client_key uuid := coalesce(p_client_id, gen_random_uuid());
  minute_window timestamptz := date_trunc('minute', now());
  client_attempts integer;
  event_attempts integer;
  inserted public.player_registrations%rowtype;
begin
  -- Honeypot: real users never see or fill this field.
  if coalesce(trim(p_website), '') <> '' then
    raise exception 'Registration could not be completed.';
  end if;
  if length(clean_name) < 2 or length(clean_name) > 120 then
    raise exception 'Enter a valid player name.';
  end if;
  if p_skill_level not in ('novice', 'beginner', 'intermediate', 'advanced', 'competitive') then
    raise exception 'Select a valid skill level.';
  end if;

  insert into public.public_registration_rate_limits(event_id, client_id, window_started_at)
  values (p_event_id, client_key, minute_window)
  on conflict (event_id, client_id, window_started_at)
  do update set request_count = public.public_registration_rate_limits.request_count + 1
  returning request_count into client_attempts;

  select coalesce(sum(request_count), 0)::integer into event_attempts
  from public.public_registration_rate_limits
  where event_id = p_event_id and window_started_at = minute_window;

  if client_attempts > 5 or event_attempts > 60 then
    raise exception 'Too many registration attempts. Please wait a minute and try again.';
  end if;

  insert into public.player_registrations(event_id, full_name, email, phone, skill_level)
  values (
    p_event_id,
    clean_name,
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    p_skill_level
  ) returning * into inserted;

  return jsonb_build_object('id', inserted.id, 'status', inserted.status);
end;
$$;

drop policy if exists "Anyone can register for an open event" on public.player_registrations;
create policy "Organizers add players to their events"
on public.player_registrations for insert to authenticated
with check (public.organizer_owns_event(event_id));
revoke insert on public.player_registrations from anon;
grant execute on function public.register_player(uuid, text, text, text, text, uuid, text) to anon, authenticated;

drop policy if exists "Organizers create retention requests" on public.retention_extension_requests;
create policy "Organizers create retention requests"
on public.retention_extension_requests for insert to authenticated
with check (
  organizer_user_id = auth.uid()
  and public.organizer_owns_event(event_id)
  and requested_until > (
    select event_record.event_date + 3
    from public.events event_record
    where event_record.id = retention_extension_requests.event_id
  )
);

create table if not exists public.court_score_rate_limits (
  access_id uuid not null references public.court_scoring_access(id) on delete cascade,
  window_started_at timestamptz not null default date_trunc('minute', now()),
  request_count integer not null default 1,
  primary key (access_id, window_started_at)
);
alter table public.court_score_rate_limits enable row level security;
revoke all on public.court_score_rate_limits from anon, authenticated;

create or replace function public.update_court_score(
  p_token uuid, p_game_id uuid, p_team_one_score integer, p_team_two_score integer
) returns void language plpgsql security definer set search_path = public as $$
declare
  access_row public.court_scoring_access%rowtype;
  game_row public.games%rowtype;
  attempts integer;
begin
  select * into access_row from public.court_scoring_access
  where access_token = p_token and revoked_at is null and expires_at > now();
  if not found then raise exception 'This scoring link is invalid or has expired'; end if;

  insert into public.court_score_rate_limits(access_id, window_started_at)
  values (access_row.id, date_trunc('minute', now()))
  on conflict (access_id, window_started_at)
  do update set request_count = public.court_score_rate_limits.request_count + 1
  returning request_count into attempts;
  if attempts > 30 then raise exception 'Too many score changes. Please wait a moment.'; end if;

  select * into game_row from public.games
  where id = p_game_id and court_id = access_row.court_id and status = 'playing'
  for update;
  if not found then raise exception 'This game is no longer active on this court'; end if;
  if p_team_one_score < 0 or p_team_two_score < 0
     or p_team_one_score > game_row.points_to_win + 10
     or p_team_two_score > game_row.points_to_win + 10 then
    raise exception 'That score is outside the allowed range.';
  end if;
  if abs(p_team_one_score - coalesce(game_row.team_one_score, 0)) > 1
     or abs(p_team_two_score - coalesce(game_row.team_two_score, 0)) > 1
     or (p_team_one_score <> coalesce(game_row.team_one_score, 0)
         and p_team_two_score <> coalesce(game_row.team_two_score, 0)) then
    raise exception 'Scores can only be changed one point at a time.';
  end if;

  update public.games
  set team_one_score = p_team_one_score, team_two_score = p_team_two_score
  where id = game_row.id;
end;
$$;
revoke all on function public.update_court_score(uuid, uuid, integer, integer) from public;
grant execute on function public.update_court_score(uuid, uuid, integer, integer) to anon, authenticated;

create or replace function public.enforce_organizer_event_quota()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare active_events integer;
begin
  if auth.uid() is null or auth.uid() <> new.organizer_user_id then
    raise exception 'You do not have permission to create this event.';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your email before creating an event.';
  end if;
  select count(*)::integer into active_events from public.events
  where organizer_user_id = auth.uid() and status in ('draft', 'open', 'closed');
  if active_events >= 3 then
    raise exception 'The free version allows up to 3 active events per organizer.';
  end if;
  if new.registration_limit is null or new.registration_limit > 200 then
    raise exception 'The free version allows up to 200 players per event.';
  end if;
  return new;
end;
$$;
drop trigger if exists enforce_organizer_event_quota_before_insert on public.events;
create trigger enforce_organizer_event_quota_before_insert
before insert on public.events for each row execute procedure public.enforce_organizer_event_quota();

create table if not exists public.app_improvement_suggestions (
  id uuid primary key default gen_random_uuid(),
  organizer_user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('feature', 'improvement', 'usability', 'other')),
  title text not null check (char_length(title) between 3 and 120),
  details text not null check (char_length(details) between 10 and 3000),
  donation_amount_usd numeric(10,2) not null check (donation_amount_usd >= 10),
  paypal_order_id text not null unique,
  paypal_capture_id text,
  status text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'declined', 'completed')),
  created_at timestamptz not null default now()
);
alter table public.app_improvement_suggestions enable row level security;
drop policy if exists "Organizers submit their suggestions" on public.app_improvement_suggestions;
create policy "Organizers submit their suggestions" on public.app_improvement_suggestions
for insert to authenticated with check (auth.uid() = organizer_user_id);
drop policy if exists "Organizers view their suggestions" on public.app_improvement_suggestions;
create policy "Organizers view their suggestions" on public.app_improvement_suggestions
for select to authenticated using (auth.uid() = organizer_user_id);
grant select, insert on public.app_improvement_suggestions to authenticated;

