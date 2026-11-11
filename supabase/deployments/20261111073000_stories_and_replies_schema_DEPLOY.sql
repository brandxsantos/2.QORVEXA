-- ============================================================================
-- QORVEXA: STORIES, INSTANTS & STORY REPLIES SCHEMA DEPLOYMENT PATCH
-- 1. Safely adds is_story column to public.instants
-- 2. Safely adds story_id and story_metadata columns to public.messages
-- 3. Updates message_type check constraint for story_reply
-- 4. Updates notifications_type_check to allow story and story_reply
-- 5. Configures authoritative RPCs and storage access policies
-- 6. Reloads PostgREST schema cache via NOTIFY pgrst
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Add is_story column to public.instants
-- ----------------------------------------------------------------------------
alter table public.instants
  add column if not exists is_story boolean not null default false;

create index if not exists instants_is_story_idx
  on public.instants (is_story, expires_at);

-- ----------------------------------------------------------------------------
-- 2. Add story reply columns to public.messages
-- ----------------------------------------------------------------------------
alter table public.messages
  add column if not exists message_type text not null default 'text';

alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'call', 'story_reply'));

alter table public.messages
  add column if not exists call_session_id uuid
    references public.call_sessions(id) on delete set null;

alter table public.messages
  add column if not exists story_id uuid
    references public.instants(id) on delete set null;

alter table public.messages
  add column if not exists story_metadata jsonb;

create index if not exists messages_story_id_idx
  on public.messages (story_id)
  where story_id is not null;

-- Ensure conversations has last_message_at column for backwards and forward compatibility
alter table public.conversations
  add column if not exists last_message_at timestamptz default now();

-- Ensure authenticated role can insert these columns
grant insert (
  conversation_id,
  sender_id,
  content,
  reply_to_message_id,
  message_type,
  call_session_id,
  story_id,
  story_metadata
) on public.messages to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Update notifications type check constraint
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
-- 4. Storage & Table Permissions for Instants & Stories
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
-- 5. Storage Photo Access: Allow repeat viewing of Stories for full 24h lifetime
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
-- 6. RPC: create_story
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

  -- Notify eligible recipients safely
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
-- 7. RPC: get_my_active_stories
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
-- 8. RPC: get_active_stories_inbox
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
-- 9. RPC: send_story_reply
-- ----------------------------------------------------------------------------
create or replace function public.send_story_reply(
  p_story_id uuid,
  p_content text default null,
  p_reaction text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid;
  v_story record;
  v_story_owner_id uuid;
  v_conversation_id uuid;
  v_clean_content text;
  v_metadata jsonb;
  v_message_id uuid;
  v_created_at timestamptz;
begin
  v_sender_id := auth.uid();
  if v_sender_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select id, sender_id, image_path, caption, expires_at into v_story
  from public.instants
  where id = p_story_id
    and (coalesce(is_story, false) = true or image_path like '%/story_%');

  if v_story.id is null then
    raise exception 'Story not found.';
  end if;

  if v_story.expires_at <= now() then
    raise exception 'Story has expired.';
  end if;

  v_story_owner_id := v_story.sender_id;

  if v_story_owner_id = v_sender_id then
    raise exception 'Cannot reply to your own story.';
  end if;

  -- Determine content
  if p_reaction is not null and trim(p_reaction) <> '' then
    v_clean_content := coalesce(nullif(trim(p_content), ''), trim(p_reaction));
  else
    v_clean_content := trim(coalesce(p_content, ''));
  end if;

  if char_length(v_clean_content) < 1 then
    raise exception 'Reply content or reaction cannot be empty.';
  end if;

  -- Find or create 1:1 conversation
  select id into v_conversation_id
  from public.conversations
  where user_low = least(v_sender_id, v_story_owner_id)
    and user_high = greatest(v_sender_id, v_story_owner_id);

  if v_conversation_id is null then
    insert into public.conversations (user_low, user_high, last_message_at, updated_at)
    values (least(v_sender_id, v_story_owner_id), greatest(v_sender_id, v_story_owner_id), statement_timestamp(), statement_timestamp())
    returning id into v_conversation_id;
  end if;

  v_metadata := jsonb_build_object(
    'story_id', v_story.id,
    'image_path', v_story.image_path,
    'caption', v_story.caption,
    'sender_id', v_story.sender_id,
    'expires_at', v_story.expires_at,
    'reaction', nullif(trim(p_reaction), '')
  );

  insert into public.messages (
    conversation_id,
    sender_id,
    content,
    message_type,
    story_id,
    story_metadata,
    created_at
  ) values (
    v_conversation_id,
    v_sender_id,
    v_clean_content,
    'story_reply',
    p_story_id,
    v_metadata,
    statement_timestamp()
  ) returning id, created_at into v_message_id, v_created_at;

  update public.conversations
  set last_message_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = v_conversation_id;

  return jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'conversation_id', v_conversation_id,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.send_story_reply(uuid, text, text) from public, anon;
grant execute on function public.send_story_reply(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 9b. RPC: start_direct_conversation (updates updated_at on existing chat)
-- ----------------------------------------------------------------------------
create or replace function public.start_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null or current_user_id = target_user_id
      or qorvexa_private.are_blocked(current_user_id, target_user_id)
      or not qorvexa_private.are_friends(current_user_id, target_user_id) then
    raise exception 'You can message accepted friends who have not blocked you.';
  end if;

  insert into public.conversations (user_low, user_high, last_message_at, updated_at)
  values (
    least(current_user_id, target_user_id),
    greatest(current_user_id, target_user_id),
    statement_timestamp(),
    statement_timestamp()
  )
  on conflict (user_low, user_high) do update
  set updated_at = statement_timestamp()
  returning id into conversation_id;

  if conversation_id is null then
    select id into conversation_id from public.conversations
    where user_low = least(current_user_id, target_user_id)
      and user_high = greatest(current_user_id, target_user_id);
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 10. Data Repair: Flag existing story_ paths as is_story = true
-- ----------------------------------------------------------------------------
update public.instants
set is_story = true
where coalesce(is_story, false) = false
  and image_path like '%/story_%';

-- ----------------------------------------------------------------------------
-- 11. Explicit PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

commit;
