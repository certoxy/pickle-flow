create table if not exists public.event_player_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, name)
);

alter table public.event_player_categories enable row level security;
grant select on public.event_player_categories to anon;
grant select, insert, update, delete on public.event_player_categories to authenticated;
grant select, insert, update, delete on public.event_player_categories to service_role;

create policy "Public can read active player categories"
  on public.event_player_categories for select to anon using (is_active);
create policy "Organizers manage player categories"
  on public.event_player_categories for all to authenticated
  using (public.organizer_owns_event(event_id))
  with check (public.organizer_owns_event(event_id));

alter table public.event_skill_levels
  add column if not exists category_id uuid
  references public.event_player_categories(id) on delete set null;

alter table public.event_courts
  add column if not exists category_id uuid
  references public.event_player_categories(id) on delete set null;

insert into public.event_player_categories (event_id, name, sort_order)
select id, 'All Players', 10 from public.events
on conflict (event_id, name) do nothing;

update public.event_skill_levels skill
set category_id = category.id
from public.event_player_categories category
where category.event_id = skill.event_id
  and category.name = 'All Players'
  and skill.category_id is null;

update public.event_courts court
set category_id = category.id
from public.event_player_categories category
where category.event_id = court.event_id
  and category.name = 'All Players'
  and court.category_id is null;

create or replace function public.assign_default_skill_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null then
    select id into new.category_id
    from public.event_player_categories
    where event_id = new.event_id and name = 'All Players'
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function public.assign_default_skill_category() from public, anon, authenticated;
grant execute on function public.assign_default_skill_category() to service_role;

drop trigger if exists assign_default_skill_category_before_write on public.event_skill_levels;
create trigger assign_default_skill_category_before_write
  before insert or update of event_id, category_id on public.event_skill_levels
  for each row execute function public.assign_default_skill_category();

create or replace function public.seed_event_player_category()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_category_id uuid;
begin
  insert into public.event_player_categories (event_id, name, sort_order)
  values (new.id, 'All Players', 10)
  on conflict (event_id, name) do update set name = excluded.name
  returning id into new_category_id;

  update public.event_skill_levels
  set category_id = new_category_id
  where event_id = new.id and category_id is null;
  return new;
end;
$$;

revoke all on function public.seed_event_player_category() from public, anon, authenticated;
grant execute on function public.seed_event_player_category() to service_role;

drop trigger if exists seed_event_player_category_after_insert on public.events;
create trigger seed_event_player_category_after_insert
  after insert on public.events
  for each row execute function public.seed_event_player_category();

create index if not exists event_skill_levels_category_idx
  on public.event_skill_levels(category_id);
create index if not exists event_courts_category_idx
  on public.event_courts(category_id);

notify pgrst, 'reload schema';
