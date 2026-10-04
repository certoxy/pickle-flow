update public.player_registrations
set email = nullif(trim(email), ''),
    phone = nullif(trim(phone), '');

alter table public.player_registrations
  add constraint player_contact_required
  check (email is not null or phone is not null) not valid;

create unique index if not exists player_event_email_unique
  on public.player_registrations (event_id, lower(trim(email)))
  where email is not null;

create unique index if not exists player_event_phone_unique
  on public.player_registrations (event_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null;
