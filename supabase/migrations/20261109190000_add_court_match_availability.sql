alter table public.event_courts
  add column if not exists accepting_matches boolean not null default true;

update public.event_courts
set accepting_matches = false
where status = 'disabled';

comment on column public.event_courts.accepting_matches is
  'When false, the current game may finish but no new match is assigned to this court.';

grant select, insert, update, delete on public.event_courts to authenticated;
grant select on public.event_courts to service_role;

notify pgrst, 'reload schema';
