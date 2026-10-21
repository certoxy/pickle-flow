alter table public.events
  add column if not exists play_end_time time,
  add column if not exists equalization_started_at timestamptz,
  add column if not exists official_games_target integer,
  add column if not exists equalization_roster jsonb not null default '[]'::jsonb,
  add column if not exists rankings_locked_at timestamptz;

alter table public.game_players
  add column if not exists counts_toward_standings boolean not null default true,
  add column if not exists is_fill_in boolean not null default false;

alter table public.events
  drop constraint if exists events_official_games_target_check;

alter table public.events
  add constraint events_official_games_target_check
  check (official_games_target is null or official_games_target > 0);

comment on column public.events.play_end_time is
  'Scheduled end of official play. Final equalization begins 30 minutes earlier.';

comment on column public.events.equalization_roster is
  'Player registration IDs eligible for official ranking when final equalization starts.';

comment on column public.game_players.counts_toward_standings is
  'False for fill-in appearances that must not affect official player rankings.';
