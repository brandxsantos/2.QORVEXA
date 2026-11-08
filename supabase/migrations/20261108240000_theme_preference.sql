alter table public.profiles
  add column if not exists theme_preference text not null default 'dark';

alter table public.profiles
  add constraint profiles_theme_preference_check
  check (theme_preference in ('dark', 'light'));

drop function if exists public.get_own_profile_settings();

create function public.get_own_profile_settings()
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text,
  cover_photo_path text, location text, website text, education text,
  workplace text, profile_visibility text, friends_visibility text,
  online_status_visibility text, location_visibility text,
  website_visibility text, education_visibility text, workplace_visibility text,
  availability_status text, theme_preference text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar_url,
    p.cover_photo_path, p.location, p.website, p.education, p.workplace,
    p.profile_visibility, p.friends_visibility, p.online_status_visibility,
    p.location_visibility, p.website_visibility, p.education_visibility,
    p.workplace_visibility, p.availability_status, p.theme_preference
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_own_profile_settings() from public, anon;
grant execute on function public.get_own_profile_settings() to authenticated;

GRANT UPDATE (theme_preference) ON public.profiles TO authenticated;
