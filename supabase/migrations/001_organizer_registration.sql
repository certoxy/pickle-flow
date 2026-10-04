create extension if not exists pgcrypto;

create table if not exists public.organizer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null default '',
  organization_name text not null default '',
  phone text,
  city text,
  country text default 'Philippines',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organizer_profiles enable row level security;

drop policy if exists "Organizers can view their own profile" on public.organizer_profiles;
create policy "Organizers can view their own profile"
on public.organizer_profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Organizers can update their own profile" on public.organizer_profiles;
create policy "Organizers can update their own profile"
on public.organizer_profiles for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.handle_new_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organizer_profiles (
    user_id,
    full_name,
    organization_name,
    phone,
    city,
    country
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Philippines')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_organizer();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizer_profiles_set_updated_at on public.organizer_profiles;
create trigger organizer_profiles_set_updated_at
before update on public.organizer_profiles
for each row execute procedure public.set_updated_at();

grant usage on schema public to authenticated;
grant select, update on public.organizer_profiles to authenticated;
