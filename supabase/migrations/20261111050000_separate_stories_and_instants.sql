-- ============================================================================
-- QORVEXA: SEPARATE STORIES AND INSTANTS INTO DEDICATED EXPERIENCES
-- Adds is_story column to instants table, creates create_story,
-- enables repeat viewing for active stories, and separates inbox queries.
-- ============================================================================

begin;

-- 1. Add is_story column to public.instants
alter table public.instants
  add column if not exists is_story boolean not null default false;

create index if not exists instants_is_story_idx on public.instants (is_story, expires_at);

-- 2. RPC: Create Story (Supports gallery or camera, repeat viewing while active)
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

  -- Notify eligible recipients if notifications table exists
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'notifications') then
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

-- 3. RPC: Get Active Stories Inbox (Friends' active stories)
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
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
    ) order by ir.is_viewed asc, i.created_at desc
  ), '[]'::jsonb) into v_result
  from public.instant_recipients ir
  join public.instants i on i.id = ir.instant_id
  join public.profiles p on p.id = i.sender_id
  where ir.recipient_id = v_user_id
    and coalesce(i.is_story, false) = true
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_active_stories_inbox() from public, anon;
grant execute on function public.get_active_stories_inbox() to authenticated;

-- 4. RPC: Get My Active Stories
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
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
    ) order by i.created_at asc
  ), '[]'::jsonb) into v_result
  from public.instants i
  join public.profiles p on p.id = i.sender_id
  where i.sender_id = v_user_id
    and coalesce(i.is_story, false) = true
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_my_active_stories() from public, anon;
grant execute on function public.get_my_active_stories() to authenticated;

-- 5. Update consume_and_view_instant:
-- Repeat viewing is allowed for stories while active.
-- View-once is strictly enforced for Instants (is_story = false).
create or replace function public.consume_and_view_instant(p_instant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_recipient_record record;
  v_instant_record record;
  v_sender_record record;
  v_my_reaction text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- Load instant record
  select * into v_instant_record
  from public.instants
  where id = p_instant_id;

  if v_instant_record is null then
    raise exception 'Item not found.';
  end if;

  if v_instant_record.expires_at < now() then
    raise exception 'This item has expired.';
  end if;

  -- If caller is the sender, allow viewing without consuming
  if v_instant_record.sender_id = v_user_id then
    select id, username, display_name, avatar_url into v_sender_record
    from public.profiles
    where id = v_user_id;

    return jsonb_build_object(
      'id', v_instant_record.id,
      'image_path', v_instant_record.image_path,
      'caption', v_instant_record.caption,
      'audience_type', v_instant_record.audience_type,
      'created_at', v_instant_record.created_at,
      'expires_at', v_instant_record.expires_at,
      'is_own', true,
      'is_story', coalesce(v_instant_record.is_story, false),
      'total_recipients', (
        select count(*) from public.instant_recipients ir where ir.instant_id = v_instant_record.id
      ),
      'viewed_count', (
        select count(*) from public.instant_recipients ir where ir.instant_id = v_instant_record.id and ir.is_viewed
      ),
      'sender', jsonb_build_object(
        'id', v_sender_record.id,
        'username', v_sender_record.username,
        'display_name', v_sender_record.display_name,
        'avatar_url', v_sender_record.avatar_url
      )
    );
  end if;

  -- Recipient branch:
  select * into v_recipient_record
  from public.instant_recipients
  where instant_id = p_instant_id
    and recipient_id = v_user_id
  for update;

  if v_recipient_record is null then
    raise exception 'You are not an authorized recipient of this item.';
  end if;

  -- If it's an Instant snap (not a story), enforce view-once
  if not coalesce(v_instant_record.is_story, false) and v_recipient_record.is_viewed then
    raise exception 'This Instant has already been viewed.';
  end if;

  -- Mark as viewed (records viewed status for unread indicator)
  update public.instant_recipients
  set is_viewed = true,
      viewed_at = coalesce(viewed_at, now())
  where instant_id = p_instant_id
    and recipient_id = v_user_id;

  -- Sender details
  select id, username, display_name, avatar_url into v_sender_record
  from public.profiles
  where id = v_instant_record.sender_id;

  -- User reaction
  select reaction into v_my_reaction
  from public.instant_reactions
  where instant_id = p_instant_id
    and user_id = v_user_id;

  return jsonb_build_object(
    'id', v_instant_record.id,
    'image_path', v_instant_record.image_path,
    'caption', v_instant_record.caption,
    'audience_type', v_instant_record.audience_type,
    'created_at', v_instant_record.created_at,
    'expires_at', v_instant_record.expires_at,
    'is_own', false,
    'is_story', coalesce(v_instant_record.is_story, false),
    'viewed_at', now(),
    'sender', jsonb_build_object(
      'id', v_sender_record.id,
      'username', v_sender_record.username,
      'display_name', v_sender_record.display_name,
      'avatar_url', v_sender_record.avatar_url
    ),
    'my_reaction', v_my_reaction
  );
end;
$$;

revoke all on function public.consume_and_view_instant(uuid) from public, anon;
grant execute on function public.consume_and_view_instant(uuid) to authenticated;

-- 6. Update get_active_instants_inbox and get_my_active_instants to filter is_story = false
create or replace function public.get_active_instants_inbox()
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
      'is_story', false,
      'sender', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
    ) order by ir.is_viewed asc, i.created_at desc
  ), '[]'::jsonb) into v_result
  from public.instant_recipients ir
  join public.instants i on i.id = ir.instant_id
  join public.profiles p on p.id = i.sender_id
  where ir.recipient_id = v_user_id
    and coalesce(i.is_story, false) = false
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_active_instants_inbox() from public, anon;
grant execute on function public.get_active_instants_inbox() to authenticated;

create or replace function public.get_my_active_instants()
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
      'is_story', false,
      'total_recipients', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id
      ),
      'viewed_count', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id and ir.is_viewed
      ),
      'sender', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      )
    ) order by i.created_at asc
  ), '[]'::jsonb) into v_result
  from public.instants i
  join public.profiles p on p.id = i.sender_id
  where i.sender_id = v_user_id
    and coalesce(i.is_story, false) = false
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_my_active_instants() from public, anon;
grant execute on function public.get_my_active_instants() to authenticated;

commit;
