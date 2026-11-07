alter table public.profiles
  add column if not exists availability_status text not null default 'online';

alter table public.profiles
  drop constraint if exists profiles_availability_status_check;

alter table public.profiles
  add constraint profiles_availability_status_check
  check (availability_status in ('online', 'offline', 'busy'));

grant update (availability_status) on public.profiles to authenticated;

drop function if exists public.get_own_profile_settings();

create function public.get_own_profile_settings()
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text,
  cover_photo_path text, location text, website text, education text,
  workplace text, profile_visibility text, friends_visibility text,
  online_status_visibility text, location_visibility text,
  website_visibility text, education_visibility text, workplace_visibility text,
  availability_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar_url,
    p.cover_photo_path, p.location, p.website, p.education, p.workplace,
    p.profile_visibility, p.friends_visibility, p.online_status_visibility,
    p.location_visibility, p.website_visibility, p.education_visibility, p.workplace_visibility,
    p.availability_status
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_own_profile_settings() from public, anon;
grant execute on function public.get_own_profile_settings() to authenticated;
