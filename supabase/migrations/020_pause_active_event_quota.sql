-- The active-event quota is intentionally paused for the current free launch.
-- Keep organizer verification and the per-event player cap in place.
create or replace function public.enforce_organizer_event_quota()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null or auth.uid() <> new.organizer_user_id then
    raise exception 'You do not have permission to create this event.';
  end if;
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your email before creating an event.';
  end if;
  if new.registration_limit is null or new.registration_limit > 200 then
    raise exception 'The free version allows up to 200 players per event.';
  end if;
  return new;
end;
$$;
