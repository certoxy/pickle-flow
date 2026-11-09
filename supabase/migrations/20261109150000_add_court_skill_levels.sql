alter table public.event_courts
  add column if not exists allowed_skill_levels text[] not null default '{}'::text[];

comment on column public.event_courts.allowed_skill_levels is
  'Event skill-level codes allowed on this court. An empty array means all skill levels.';

grant select, insert, update, delete
on public.event_courts
to authenticated;

grant select
on public.event_courts
to service_role;
