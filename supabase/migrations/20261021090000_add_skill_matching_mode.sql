-- Skill matching strategy for Open Play.
-- Existing events and new events default to Balanced Matches.
alter table public.events
  add column if not exists skill_matching_mode text not null default 'balanced';

update public.events
set skill_matching_mode = 'balanced'
where skill_matching_mode is null
   or skill_matching_mode not in ('balanced', 'similar_skill', 'mix_everyone');

alter table public.events
  drop constraint if exists events_skill_matching_mode_check;

alter table public.events
  add constraint events_skill_matching_mode_check
  check (skill_matching_mode in ('balanced', 'similar_skill', 'mix_everyone'));

comment on column public.events.skill_matching_mode is
  'Open Play matching strategy: balanced, similar_skill, or mix_everyone.';
