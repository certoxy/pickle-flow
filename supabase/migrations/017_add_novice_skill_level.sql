alter table public.player_registrations
  drop constraint if exists player_registrations_skill_level_check;

alter table public.player_registrations
  add constraint player_registrations_skill_level_check
  check (skill_level in ('novice', 'beginner', 'intermediate', 'advanced', 'competitive'));
