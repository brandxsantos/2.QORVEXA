-- QORVEXA: Reserved administrative identities limiter
-- Prevents regular users from using "QORVEXA", "QORVEXA Admin", "Admin", or variations
-- in their username or display name, reserving them exclusively for the platform owner (super_admin).

create schema if not exists qorvexa_private;

-- Check if an account is a super administrator (owner)
create or replace function qorvexa_private.is_super_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = coalesce(target_user_id, auth.uid())
      and role = 'super_admin'
  );
$$;

revoke all on function qorvexa_private.is_super_admin(uuid) from public, anon;
grant execute on function qorvexa_private.is_super_admin(uuid) to authenticated;

-- Pattern check for reserved brand and administrative names
create or replace function qorvexa_private.is_reserved_identity(val text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw_text text;
  clean_text text;
  normalized text;
begin
  if val is null or trim(val) = '' then
    return false;
  end if;

  raw_text := trim(val);
  clean_text := lower(raw_text);
  normalized := regexp_replace(clean_text, '[^a-z0-9]', '', 'g');

  -- 1. Brand name protection (catches "qorvexa", "QORVEXA", "q.o.r.v.e.x.a", "q-o-r-v-e-x-a")
  if clean_text ~* 'qorvexa' or normalized ~* 'qorvexa' then
    return true;
  end if;

  -- 2. Administrator variations
  -- Matches whole-word admin/administrator/sysadmin
  if clean_text ~* '\y(admin|administrator|sysadmin)\y'
     or normalized in ('admin', 'administrator', 'sysadmin')
     or normalized ~* '^admin[0-9]*$'
     or normalized ~* '^administrator[0-9]*$'
     or clean_text ~* '^admin(_|[0-9]|$)'
     or clean_text ~* '(_|^)admin$'
     or clean_text ~* '^administrator(_|[0-9]|$)'
     or clean_text ~* '(_|^)administrator$'
  then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function qorvexa_private.is_reserved_identity(text) from public, anon;
grant execute on function qorvexa_private.is_reserved_identity(text) to authenticated;

-- Enforce check on public.profiles table
create or replace function public.check_reserved_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Platform owner (super_admin) is permitted to use reserved identities
  if qorvexa_private.is_super_admin(new.id) then
    return new;
  end if;

  -- Check username
  if qorvexa_private.is_reserved_identity(new.username) then
    raise exception 'The username "%" is reserved for platform administrators.', new.username
      using errcode = '23514';
  end if;

  -- Check display_name
  if qorvexa_private.is_reserved_identity(new.display_name) then
    raise exception 'The display name "%" is reserved for platform administrators.', new.display_name
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.check_reserved_profile_identity() from public, anon;

drop trigger if exists trg_check_reserved_profile_identity on public.profiles;
create trigger trg_check_reserved_profile_identity
  before insert or update of username, display_name on public.profiles
  for each row execute function public.check_reserved_profile_identity();

-- Update handle_new_user to sanitize reserved names on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_username text;
  profile_display_name text;
  is_owner boolean;
begin
  is_owner := qorvexa_private.is_super_admin(new.id);

  profile_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));

  -- Sanitize username if invalid format or reserved (for non-owner)
  if profile_username !~ '^[a-z0-9_]{3,24}$'
     or (not is_owner and qorvexa_private.is_reserved_identity(profile_username)) then
    profile_username := 'user_' || substring(replace(new.id::text, '-', ''), 1, 19);
  end if;

  profile_display_name := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));

  -- Sanitize display name if invalid length or reserved (for non-owner)
  if char_length(profile_display_name) not between 2 and 60
     or (not is_owner and qorvexa_private.is_reserved_identity(profile_display_name)) then
    profile_display_name := profile_username;
  end if;

  insert into public.profiles (id, username, display_name)
  values (new.id, profile_username, profile_display_name);

  return new;
end;
$$;
