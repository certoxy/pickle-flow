alter table public.events
  add column if not exists organizer_contact_phone text,
  add column if not exists location_lat numeric(9, 6),
  add column if not exists location_lng numeric(9, 6);

alter table public.events
  drop constraint if exists events_location_lat_check,
  drop constraint if exists events_location_lng_check;

alter table public.events
  add constraint events_location_lat_check check (location_lat is null or location_lat between -90 and 90),
  add constraint events_location_lng_check check (location_lng is null or location_lng between -180 and 180);
