create or replace function public.get_event_registration_count(p_event_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.player_registrations registrations
  join public.events event_record on event_record.id = registrations.event_id
  where registrations.event_id = p_event_id
    and registrations.status <> 'cancelled'
    and event_record.status = 'open';
$$;

grant execute on function public.get_event_registration_count(uuid) to anon, authenticated;

create or replace function public.enforce_event_registration_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  event_limit integer;
  registration_count integer;
  event_status text;
begin
  select registration_limit, status
  into event_limit, event_status
  from public.events
  where id = new.event_id
  for update;

  if event_status <> 'open' then
    raise exception 'This event is not accepting registrations.';
  end if;

  if event_limit is not null then
    select count(*) into registration_count
    from public.player_registrations
    where event_id = new.event_id and status <> 'cancelled';

    if registration_count >= event_limit then
      raise exception 'Registration is full.';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_event_capacity_before_insert
before insert on public.player_registrations
for each row execute procedure public.enforce_event_registration_capacity();
