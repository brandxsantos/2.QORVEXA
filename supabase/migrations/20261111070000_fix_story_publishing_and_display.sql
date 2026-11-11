-- ============================================================================
-- QORVEXA: FIX STORY PUBLISHING AND DISPLAY
-- 1. Updates notifications_type_check to allow 'story' and 'story_reply'
-- 2. Hardens create_story to never fail on notification failures
-- 3. Updates get_my_active_stories & get_active_stories_inbox with resilient LEFT JOIN
-- 4. Updates storage/access logic for stories (repeat viewing during 24h lifetime)
-- 5. Grants direct insert permission on instants to authenticated as fallback
-- 6. Repairs existing stories where is_story was incorrectly set to false
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Update notifications type check constraint to include 'story' and 'story_reply'
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.notifications') is not null then
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
        'new_follower',
        'instant',
        'instant_reaction',
        'story',
        'story_reply'
      ));
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Grant fallback insert permissions to authenticated role on instants & instant_recipients
-- ----------------------------------------------------------------------------
grant insert (
  sender_id,
  image_path,
  caption,
  audience_type,
  expires_at,
  is_story
) on public.instants to authenticated;

grant insert (
  instant_id,
  recipient_id
) on public.instant_recipients to authenticated;

drop policy if exists "Members can insert their own instants or stories" on public.instants;
create policy "Members can insert their own instants or stories"
  on public.instants for insert to authenticated
  with check (sender_id = (select auth.uid()));

drop policy if exists "Senders can insert recipients for their instants or stories" on public.instant_recipients;
create policy "Senders can insert recipients for their instants or stories"
  on public.instant_recipients for insert to authenticated
  with check (
    exists (
      select 1 from public.instants i
      where i.id = instant_id and i.sender_id = (select auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Storage Photo Access: Allow repeat viewing of Stories for full 24h lifetime
-- ----------------------------------------------------------------------------
create or replace function qorvexa_private.can_access_instant_photo(
  p_image_path text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.instants i
    join public.instant_recipients ir on ir.instant_id = i.id
    where ir.recipient_id = coalesce(p_user_id, auth.uid())
      and i.image_path = p_image_path
      and i.expires_at > now()
      and (
        coalesce(i.is_story, false) = true
        or i.image_path like '%/story_%'
        or not ir.is_viewed
        or ir.viewed_at >= (now() - interval '2 minutes')
      )
  );
$$;

revoke all on function qorvexa_private.can_access_instant_photo(text, uuid) from public, anon;
grant execute on function qorvexa_private.can_access_instant_photo(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC: create_story (Fault-tolerant with protected notification insertion)
-- ----------------------------------------------------------------------------
create or replace function public.create_story(
  p_image_path text,
  p_caption text default null,
  p_audience_type text default 'friends'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid;
  v_story_id uuid;
  v_recipient_count integer := 0;
  v_expires_at timestamptz;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_audience_type not in ('friends', 'close_friends') then
    raise exception 'Audience must be either "friends" or "close_friends".';
  end if;

  if p_caption is not null and char_length(p_caption) > 300 then
    raise exception 'Caption must be 300 characters or fewer.';
  end if;

  if p_image_path is null or trim(p_image_path) = '' then
    raise exception 'Story image path is required.';
  end if;

  v_expires_at := now() + interval '24 hours';

  -- Insert story into instants table with is_story = true
  insert into public.instants (
    sender_id, image_path, caption, audience_type, expires_at, is_story
  ) values (
    v_sender_id, p_image_path, nullif(trim(p_caption), ''), p_audience_type, v_expires_at, true
  ) returning id into v_story_id;

  -- Determine eligible recipients based on audience
  if p_audience_type = 'close_friends' then
    insert into public.instant_recipients (instant_id, recipient_id)
    select v_story_id, cf.friend_id
    from public.close_friends cf
    where cf.user_id = v_sender_id
      and exists (
        select 1 from public.friendships f
        where ((f.user_low = least(v_sender_id, cf.friend_id) and f.user_high = greatest(v_sender_id, cf.friend_id)))
      )
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker_id = v_sender_id and bu.blocked_id = cf.friend_id)
           or (bu.blocker_id = cf.friend_id and bu.blocked_id = v_sender_id)
      );
  else
    insert into public.instant_recipients (instant_id, recipient_id)
    select v_story_id,
           case when f.user_low = v_sender_id then f.user_high else f.user_low end as recipient_id
    from public.friendships f
    where (f.user_low = v_sender_id or f.user_high = v_sender_id)
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker_id = v_sender_id and bu.blocked_id = (case when f.user_low = v_sender_id then f.user_high else f.user_low end))
           or (bu.blocker_id = (case when f.user_low = v_sender_id then f.user_high else f.user_low end) and bu.blocked_id = v_sender_id)
      );
  end if;

  get diagnostics v_recipient_count = row_count;

  -- Notify eligible recipients safely (never fail story creation if notifications trigger error)
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'notifications') then
    begin
      insert into public.notifications (user_id, actor_id, type, reference_id, preview)
      select ir.recipient_id,
             v_sender_id,
             'story',
             v_story_id,
             case
               when p_audience_type = 'close_friends' then 'Shared a Close Friends Story'
               else 'Added to their Story'
             end
      from public.instant_recipients ir
      where ir.instant_id = v_story_id;
    exception when others then
      -- Log/swallow notification failure so story creation always succeeds
      null;
    end;
  end if;

  return jsonb_build_object(
    'story_id', v_story_id,
    'recipient_count', v_recipient_count,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.create_story(text, text, text) from public, anon;
grant execute on function public.create_story(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. RPC: get_my_active_stories (Uses LEFT JOIN on profiles and matches story paths)
-- ----------------------------------------------------------------------------
create or replace function public.get_my_active_stories()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'sender_id', i.sender_id,
      'image_path', i.image_path,
      'caption', i.caption,
      'audience_type', i.audience_type,
      'created_at', i.created_at,
      'expires_at', i.expires_at,
      'is_expired', false,
      'is_own', true,
      'is_story', true,
      'total_recipients', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id
      ),
      'viewed_count', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id and ir.is_viewed
      ),
      'sender', jsonb_build_object(
        'id', coalesce(p.id, v_user_id),
        'username', coalesce(p.username, 'you'),
        'display_name', coalesce(p.display_name, 'Your Story'),
        'avatar_url', p.avatar_url
      )
    ) order by i.created_at asc
  ), '[]'::jsonb) into v_result
  from public.instants i
  left join public.profiles p on p.id = i.sender_id
  where i.sender_id = v_user_id
    and (coalesce(i.is_story, false) = true or i.image_path like '%/story_%')
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_my_active_stories() from public, anon;
grant execute on function public.get_my_active_stories() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. RPC: get_active_stories_inbox (Friends' active stories with LEFT JOIN)
-- ----------------------------------------------------------------------------
create or replace function public.get_active_stories_inbox()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'sender_id', i.sender_id,
      'audience_type', i.audience_type,
      'caption', i.caption,
      'created_at', i.created_at,
      'expires_at', i.expires_at,
      'is_viewed', ir.is_viewed,
      'viewed_at', ir.viewed_at,
      'is_story', true,
      'sender', jsonb_build_object(
        'id', coalesce(p.id, i.sender_id),
        'username', coalesce(p.username, 'friend'),
        'display_name', coalesce(p.display_name, 'Friend'),
        'avatar_url', p.avatar_url
      )
    ) order by ir.is_viewed asc, i.created_at desc
  ), '[]'::jsonb) into v_result
  from public.instant_recipients ir
  join public.instants i on i.id = ir.instant_id
  left join public.profiles p on p.id = i.sender_id
  where ir.recipient_id = v_user_id
    and (coalesce(i.is_story, false) = true or i.image_path like '%/story_%')
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_active_stories_inbox() from public, anon;
grant execute on function public.get_active_stories_inbox() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Data Repair: Ensure any story uploaded with story_ path is flagged is_story = true
-- ----------------------------------------------------------------------------
update public.instants
set is_story = true
where coalesce(is_story, false) = false
  and image_path like '%/story_%';

commit;
