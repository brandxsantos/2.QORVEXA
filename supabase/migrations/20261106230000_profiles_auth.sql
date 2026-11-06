create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint profiles_display_name_length check (
    char_length(display_name) between 2 and 60
  ),
  constraint profiles_bio_length check (char_length(bio) <= 280)
);

create unique index profiles_username_lower_idx
  on public.profiles (lower(username));

create index profiles_created_at_idx
  on public.profiles (created_at desc);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (username, display_name, bio, avatar_url)
  on public.profiles to authenticated;

create policy "Public profiles are viewable"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_username text;
  profile_display_name text;
begin
  profile_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  if profile_username !~ '^[a-z0-9_]{3,24}$' then
    profile_username := 'user_' || substring(replace(new.id::text, '-', ''), 1, 19);
  end if;

  profile_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  if char_length(profile_display_name) not between 2 and 60 then
    profile_display_name := profile_username;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, profile_username, profile_display_name);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
declare
  existing_user record;
  profile_username text;
  profile_display_name text;
  user_suffix text;
begin
  for existing_user in
    select id, raw_user_meta_data
    from auth.users
    order by id
  loop
    profile_username := lower(trim(coalesce(existing_user.raw_user_meta_data ->> 'username', '')));

    if profile_username !~ '^[a-z0-9_]{3,24}$'
      or exists (
        select 1 from public.profiles
        where lower(username) = profile_username
      )
    then
      user_suffix := substring(replace(existing_user.id::text, '-', ''), 1, 19);
      profile_username := 'user_' || user_suffix;

      if exists (
        select 1 from public.profiles
        where lower(username) = profile_username
      )
      then
        profile_username := 'u_' || substring(replace(existing_user.id::text, '-', ''), 1, 22);
      end if;
    end if;

    profile_display_name := trim(coalesce(existing_user.raw_user_meta_data ->> 'display_name', ''));

    if char_length(profile_display_name) not between 2 and 60 then
      profile_display_name := profile_username;
    end if;

    insert into public.profiles (id, username, display_name)
    values (existing_user.id, profile_username, profile_display_name)
    on conflict (id) do nothing;
  end loop;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_profile_updated_at() from public, anon, authenticated;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_profile_updated_at();
