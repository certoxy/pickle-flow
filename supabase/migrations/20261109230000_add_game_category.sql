alter table public.games
  add column if not exists category_id uuid
  references public.event_player_categories(id) on delete set null;

create index if not exists games_category_idx on public.games(category_id);

with game_categories as (
  select
    gp.game_id,
    min(sl.category_id::text)::uuid as category_id,
    count(distinct sl.category_id) as category_count
  from public.game_players gp
  join public.player_registrations pr
    on pr.id = gp.player_registration_id
  join public.games g
    on g.id = gp.game_id and g.event_id = pr.event_id
  join public.event_skill_levels sl
    on sl.event_id = pr.event_id and sl.code = pr.skill_level
  where sl.category_id is not null
  group by gp.game_id
)
update public.games game
set category_id = categories.category_id
from game_categories categories
where game.id = categories.game_id
  and categories.category_count = 1
  and game.category_id is null;

grant select, insert, update, delete on public.games to authenticated;
grant select on public.games to service_role;

notify pgrst, 'reload schema';
