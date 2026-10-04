alter table public.events
  add column if not exists auto_assign_next_players boolean not null default false;
