-- QORVEXA: Member following system

create table public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_follows_not_self check (follower_id <> following_id),
  constraint user_follows_unique_pair unique (follower_id, following_id)
);

create index user_follows_following_idx
  on public.user_follows (following_id, created_at desc);

create index user_follows_follower_idx
  on public.user_follows (follower_id, created_at desc);

alter table public.user_follows enable row level security;

create policy "Signed-in members can view permitted follow relationships"
  on public.user_follows
  for select to authenticated
  using (
    public.can_view_member(follower_id)
    and public.can_view_member(following_id)
  );

grant select on public.user_follows to authenticated;

-- Return public counts and the current viewer's follow status.
create or replace function public.get_profile_follow_stats(target_user_id uuid)
returns table (
  follower_count bigint,
  following_count bigint,
  is_following boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.user_follows f
      where f.following_id = target_user_id
    ),
    (
      select count(*)
      from public.user_follows f
      where f.follower_id = target_user_id
    ),
    (
      auth.uid() is not null
      and exists (
        select 1
        from public.user_follows f
        where f.follower_id = auth.uid()
          and f.following_id = target_user_id
      )
    )
  where target_user_id is not null
    and public.can_view_member(target_user_id);
$$;

-- Follow a member without creating a friend request.
create or replace function public.follow_member(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  follow_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in to follow members.';
  end if;

  if target_user_id is null or current_user_id = target_user_id then
    raise exception 'You cannot follow this member.';
  end if;

  if not exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'That member could not be found.';
  end if;

  if not public.can_view_member(target_user_id)
     or qorvexa_private.are_blocked(current_user_id, target_user_id) then
    raise exception 'You cannot follow this member.';
  end if;

  if exists (
    select 1
    from public.user_restrictions
    where user_id = current_user_id
      and restriction_type = 'following'
      and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
  ) then
    raise exception 'Following is unavailable for this account due to an active restriction.';
  end if;

  insert into public.user_follows (follower_id, following_id)
  values (current_user_id, target_user_id)
  on conflict (follower_id, following_id) do nothing
  returning id into follow_id;

  if follow_id is not null then
    insert into public.notifications (user_id, actor_id, type, reference_id)
    values (target_user_id, current_user_id, 'new_follower', follow_id);
  else
    select id into follow_id
    from public.user_follows
    where follower_id = current_user_id
      and following_id = target_user_id;
  end if;

  return follow_id;
end;
$$;

-- Unfollow without affecting an existing friendship.
create or replace function public.unfollow_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to manage followed members.';
  end if;

  if target_user_id is null or current_user_id = target_user_id then
    raise exception 'Invalid member.';
  end if;

  delete from public.user_follows
  where follower_id = current_user_id
    and following_id = target_user_id;
end;
$$;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'friend_request',
    'friend_request_accepted',
    'post_like',
    'comment',
    'reply',
    'message',
    'new_follower'
  ));

revoke all on function public.get_profile_follow_stats(uuid) from public;
revoke all on function public.follow_member(uuid) from public, anon;
revoke all on function public.unfollow_member(uuid) from public, anon;

grant execute on function public.get_profile_follow_stats(uuid) to anon, authenticated;
grant execute on function public.follow_member(uuid) to authenticated;
grant execute on function public.unfollow_member(uuid) to authenticated;

-- Allow administrators to issue a following restriction.
alter table public.user_restrictions
  drop constraint if exists user_restrictions_restriction_type_check;

alter table public.user_restrictions
  add constraint user_restrictions_restriction_type_check
  check (restriction_type in (
    'warning', 'posting', 'commenting', 'messaging',
    'friend_requests', 'following'
  ));

-- Extend administrator moderation to support following restrictions.
create or replace function public.admin_apply_restriction(
  target_user_id uuid,
  restriction_type text,
  reason text,
  expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  restriction_id uuid;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Your administrator role cannot apply restrictions.' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'You cannot restrict your own account.';
  end if;
  if restriction_type not in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests', 'following') then
    raise exception 'Invalid restriction type.';
  end if;
  if char_length(btrim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'Provide a reason between 3 and 1000 characters.';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'The target account was not found.';
  end if;
  if caller_role = 'moderator' and (
    restriction_type not in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests', 'following')
    or expires_at is null
    or expires_at > statement_timestamp() + interval '7 days'
  ) then
    raise exception 'Moderators may issue warnings or restrictions lasting up to 7 days.';
  end if;
  if exists (
    select 1 from public.admin_roles
    where user_id = target_user_id and role = 'super_admin'
  ) then
    raise exception 'Super administrator accounts cannot be restricted from this panel.';
  end if;

  insert into public.user_restrictions (user_id, restriction_type, reason, issued_by, expires_at)
  values (target_user_id, restriction_type, btrim(reason), auth.uid(), expires_at)
  returning id into restriction_id;

  insert into public.moderation_actions (admin_id, target_user_id, action_type, reason)
  values (auth.uid(), target_user_id,
    case when restriction_type = 'warning' then 'warning' else 'restriction_applied' end,
    btrim(reason));
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'user.restriction_applied', 'user', target_user_id::text, btrim(reason),
    jsonb_build_object('restriction_id', restriction_id, 'restriction_type', restriction_type, 'expires_at', expires_at));
  return restriction_id;
end;
$$;

create or replace function public.admin_revoke_restriction(restriction_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  restriction_row public.user_restrictions%rowtype;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Your administrator role cannot revoke restrictions.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'Provide a reason between 3 and 1000 characters.';
  end if;

  update public.user_restrictions
  set status = 'revoked', revoked_at = statement_timestamp(), revoked_by = auth.uid()
  where id = restriction_id and status = 'active'
    and (
      caller_role <> 'moderator'
      or (
        issued_by = auth.uid()
        and restriction_type in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests', 'following')
        and expires_at is not null
      )
    )
  returning * into restriction_row;
  if not found then
    raise exception 'The restriction is unavailable or already revoked.';
  end if;

  insert into public.moderation_actions (admin_id, target_user_id, action_type, reason)
  values (auth.uid(), restriction_row.user_id, 'restriction_revoked', btrim(reason));
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'user.restriction_revoked', 'user', restriction_row.user_id::text, btrim(reason),
    jsonb_build_object('restriction_id', restriction_row.id));
end;
$$;
