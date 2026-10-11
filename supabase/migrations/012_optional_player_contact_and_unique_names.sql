alter table public.player_registrations
  drop constraint if exists player_contact_required;

create or replace function public.normalized_player_name(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.validate_unique_player_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.player_registrations existing
    where existing.event_id = new.event_id
      and existing.id <> new.id
      and public.normalized_player_name(existing.full_name) = public.normalized_player_name(new.full_name)
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'player_event_name_unique',
      message = 'A player with this name is already registered for this event.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_unique_player_name_before_write on public.player_registrations;
create trigger validate_unique_player_name_before_write
before insert or update of full_name, event_id on public.player_registrations
for each row execute procedure public.validate_unique_player_name();

