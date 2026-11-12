alter table public.player_registrations
  add column if not exists rotation_game_baseline integer;

alter table public.player_registrations
  drop constraint if exists player_registrations_rotation_game_baseline_check;

alter table public.player_registrations
  add constraint player_registrations_rotation_game_baseline_check
  check (rotation_game_baseline is null or rotation_game_baseline >= 0);

comment on column public.player_registrations.rotation_game_baseline is
  'Completed-game baseline captured at first Game Day check-in. Used only for rotation priority; standings retain actual games played.';
