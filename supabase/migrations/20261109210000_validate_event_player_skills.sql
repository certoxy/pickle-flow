alter table public.player_registrations
  drop constraint if exists player_registrations_skill_level_check;

create or replace function public.validate_player_registration_skill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Preserve compatibility with registrations created before event-specific skills.
  if new.skill_level = 'novice' then
    new.skill_level := 'new_player';
  elsif new.skill_level = 'competitive' then
    new.skill_level := 'pro';
  end if;

  if not exists (
    select 1
    from public.event_skill_levels level
    where level.event_id = new.event_id
      and level.code = new.skill_level
  ) then
    raise exception 'Skill level % is not configured for this event', new.skill_level
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_player_registration_skill()
  from public, anon, authenticated;
grant execute on function public.validate_player_registration_skill()
  to service_role;

drop trigger if exists validate_player_registration_skill_before_write
  on public.player_registrations;
create trigger validate_player_registration_skill_before_write
  before insert or update of event_id, skill_level
  on public.player_registrations
  for each row execute function public.validate_player_registration_skill();

update public.player_registrations
set skill_level = case
  when skill_level = 'novice' then 'new_player'
  when skill_level = 'competitive' then 'pro'
  else skill_level
end
where skill_level in ('novice', 'competitive');

notify pgrst, 'reload schema';
