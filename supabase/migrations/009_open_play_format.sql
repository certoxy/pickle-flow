alter table public.events drop constraint if exists events_game_format_check;
alter table public.events
  add constraint events_game_format_check
  check (game_format in ('singles', 'doubles', 'mixed_doubles', 'open_play'));

alter table public.games drop constraint if exists games_format_check;
alter table public.games
  add constraint games_format_check
  check (format in ('singles', 'doubles', 'mixed_doubles', 'open_play'));

alter table public.events
  add column if not exists open_play_rotation text not null default 'four_on_four_off'
  check (open_play_rotation in ('four_on_four_off'));
