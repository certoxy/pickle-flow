create table if not exists public.event_skill_levels (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null check (char_length(trim(name)) between 1 and 50),
  rating numeric(3,1) not null check (rating between 1 and 9),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create unique index if not exists event_skill_levels_event_name_key
  on public.event_skill_levels (event_id, lower(name));

create index if not exists event_skill_levels_event_order_idx
  on public.event_skill_levels (event_id, sort_order);

alter table public.event_skill_levels enable row level security;

grant select on public.event_skill_levels to anon;
grant select, insert, update on public.event_skill_levels to authenticated;
grant select, insert, update, delete on public.event_skill_levels to service_role;

drop policy if exists "Public can read active event skill levels" on public.event_skill_levels;
create policy "Public can read active event skill levels"
  on public.event_skill_levels
  for select
  to anon
  using (is_active);

drop policy if exists "Authenticated users can read event skill levels" on public.event_skill_levels;
create policy "Authenticated users can read event skill levels"
  on public.event_skill_levels
  for select
  to authenticated
  using (
    is_active
    or exists (
      select 1
      from public.events
      where events.id = event_skill_levels.event_id
        and events.organizer_user_id = auth.uid()
    )
  );

drop policy if exists "Organizers can create event skill levels" on public.event_skill_levels;
create policy "Organizers can create event skill levels"
  on public.event_skill_levels
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.events
      where events.id = event_skill_levels.event_id
        and events.organizer_user_id = auth.uid()
    )
  );

drop policy if exists "Organizers can update event skill levels" on public.event_skill_levels;
create policy "Organizers can update event skill levels"
  on public.event_skill_levels
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.events
      where events.id = event_skill_levels.event_id
        and events.organizer_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.events
      where events.id = event_skill_levels.event_id
        and events.organizer_user_id = auth.uid()
    )
  );

create or replace function public.seed_event_skill_levels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.event_skill_levels
    (event_id, code, name, rating, sort_order, is_active, is_default)
  values
    (new.id, 'new_player', 'New Player', 2.0, 10, true, true),
    (new.id, 'beginner', 'Beginner', 2.5, 20, true, true),
    (new.id, 'advanced_beginner', 'Advanced Beginner', 3.0, 30, true, true),
    (new.id, 'intermediate', 'Intermediate', 3.5, 40, true, true),
    (new.id, 'advanced_intermediate', 'Advanced Intermediate', 4.0, 50, true, true),
    (new.id, 'advanced', 'Advanced', 4.5, 60, true, true),
    (new.id, 'expert', 'Expert', 5.0, 70, true, true),
    (new.id, 'pro', 'Pro', 5.5, 80, true, true)
  on conflict (event_id, code) do nothing;
  return new;
end;
$$;

revoke all on function public.seed_event_skill_levels() from public, anon, authenticated;
grant execute on function public.seed_event_skill_levels() to service_role;

drop trigger if exists seed_event_skill_levels_after_insert on public.events;
create trigger seed_event_skill_levels_after_insert
  after insert on public.events
  for each row execute function public.seed_event_skill_levels();

insert into public.event_skill_levels
  (event_id, code, name, rating, sort_order, is_active, is_default)
select
  events.id,
  defaults.code,
  defaults.name,
  defaults.rating,
  defaults.sort_order,
  true,
  true
from public.events
cross join (
  values
    ('new_player', 'New Player', 2.0::numeric, 10),
    ('beginner', 'Beginner', 2.5::numeric, 20),
    ('advanced_beginner', 'Advanced Beginner', 3.0::numeric, 30),
    ('intermediate', 'Intermediate', 3.5::numeric, 40),
    ('advanced_intermediate', 'Advanced Intermediate', 4.0::numeric, 50),
    ('advanced', 'Advanced', 4.5::numeric, 60),
    ('expert', 'Expert', 5.0::numeric, 70),
    ('pro', 'Pro', 5.5::numeric, 80)
) as defaults(code, name, rating, sort_order)
on conflict (event_id, code) do nothing;

notify pgrst, 'reload schema';
