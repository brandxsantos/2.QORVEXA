create schema qorvexa_private;
revoke all on schema qorvexa_private from public, anon, authenticated;

create table public.admin_roles (
  user_id uuid primary key references auth.users (id) on delete restrict,
  role text not null check (role in ('super_admin', 'admin', 'moderator')),
  granted_by uuid references auth.users (id) on delete restrict,
  granted_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;
revoke all on public.admin_roles from public, anon, authenticated;

create function qorvexa_private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'admin')
  );
$$;

create function public.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select qorvexa_private.is_admin();
$$;

revoke all on function public.is_current_admin() from public, anon;
grant execute on function public.is_current_admin() to authenticated;

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete restrict,
  action text not null check (char_length(action) between 1 and 100),
  target_type text check (target_type is null or char_length(target_type) <= 80),
  target_id text check (target_id is null or char_length(target_id) <= 200),
  reason text not null check (char_length(reason) between 1 and 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index admin_audit_logs_actor_id_created_at_idx
  on public.admin_audit_logs (actor_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

create policy "Administrators can read the audit log"
  on public.admin_audit_logs
  for select
  to authenticated
  using ((select public.is_current_admin()));

create function public.admin_get_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_count bigint;
begin
  if not qorvexa_private.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*) into profile_count
  from public.profiles;

  return jsonb_build_object(
    'registered_profiles', profile_count,
    'generated_at', statement_timestamp(),
    'social_tables_ready', jsonb_build_object(
      'posts', to_regclass('public.posts') is not null,
      'comments', to_regclass('public.comments') is not null,
      'follows', to_regclass('public.follows') is not null,
      'groups', to_regclass('public.groups') is not null,
      'messages', to_regclass('public.messages') is not null,
      'stories', to_regclass('public.stories') is not null
    )
  );
end;
$$;

revoke all on function public.admin_get_overview() from public, anon;
grant execute on function public.admin_get_overview() to authenticated;
