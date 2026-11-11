-- ============================================================================
-- QORVEXA: STORY REPLIES & REACTIONS INTEGRATED WITH MESSENGER
-- Enables direct Story replies and quick reactions to appear as real
-- Messenger messages with Story references and preview metadata.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Extend public.messages with story_reply message_type and story references
-- ----------------------------------------------------------------------------

-- Update check constraint on message_type to allow 'story_reply'
alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('text', 'call', 'story_reply'));

-- Add story_id referencing instants
alter table public.messages
  add column if not exists story_id uuid
    references public.instants(id) on delete set null;

-- Add story_metadata jsonb to snapshot story preview (image_path, caption, sender_id, expires_at, etc.)
alter table public.messages
  add column if not exists story_metadata jsonb;

create index if not exists messages_story_id_idx
  on public.messages (story_id)
  where story_id is not null;

-- Ensure authenticated users can insert with story reference columns
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
-- 2. RPC: send_story_reply
-- Authoritative server-side creation of a Story Reply or Reaction in Messenger.
-- Validates permissions, retrieves/creates conversation, inserts message, and deduplicates.
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
  v_sender_id uuid := auth.uid();
  v_story record;
  v_story_owner_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_clean_content text;
  v_metadata jsonb;
  v_is_eligible boolean := false;
  v_recent_message_id uuid;
begin
  if v_sender_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  -- 1. Lookup the story
  select * into v_story
  from public.instants
  where id = p_story_id and is_story = true;

  if not found then
    raise exception 'Story not found or is no longer available.';
  end if;

  if v_story.expires_at <= now() then
    raise exception 'This story has expired.';
  end if;

  v_story_owner_id := v_story.sender_id;

  if v_sender_id = v_story_owner_id then
    raise exception 'You cannot reply to your own story.';
  end if;

  -- 2. Check audience authorization
  select exists (
    select 1
    from public.instant_recipients ir
    where ir.instant_id = p_story_id
      and ir.recipient_id = v_sender_id
  ) into v_is_eligible;

  if not v_is_eligible then
    -- Check friendship
    select exists (
      select 1 from public.friendships f
      where (f.user_low = least(v_sender_id, v_story_owner_id) and f.user_high = greatest(v_sender_id, v_story_owner_id))
    ) into v_is_eligible;
  end if;

  if not v_is_eligible then
    raise exception 'You are not authorized to view or reply to this story.';
  end if;

  -- Check blocked status
  if exists (
    select 1 from public.blocked_users bu
    where (bu.blocker_id = v_sender_id and bu.blocked_id = v_story_owner_id)
       or (bu.blocker_id = v_story_owner_id and bu.blocked_id = v_sender_id)
  ) then
    raise exception 'Interaction unavailable.';
  end if;

  -- 3. Determine clean content
  if p_reaction is not null and trim(p_reaction) <> '' then
    v_clean_content := coalesce(nullif(trim(p_content), ''), trim(p_reaction));
  else
    v_clean_content := trim(coalesce(p_content, ''));
  end if;

  if char_length(v_clean_content) < 1 then
    raise exception 'Reply content or reaction cannot be empty.';
  end if;

  if char_length(v_clean_content) > 4000 then
    raise exception 'Reply content exceeds 4000 characters.';
  end if;

  -- 4. Get or create 1:1 conversation between viewer and story owner
  select id into v_conversation_id
  from public.conversations
  where user_low = least(v_sender_id, v_story_owner_id)
    and user_high = greatest(v_sender_id, v_story_owner_id);

  if v_conversation_id is null then
    insert into public.conversations (user_low, user_high)
    values (least(v_sender_id, v_story_owner_id), greatest(v_sender_id, v_story_owner_id))
    on conflict (user_low, user_high) do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select id into v_conversation_id
      from public.conversations
      where user_low = least(v_sender_id, v_story_owner_id)
        and user_high = greatest(v_sender_id, v_story_owner_id);
    end if;
  end if;

  if v_conversation_id is null then
    raise exception 'Could not start conversation with story owner.';
  end if;

  -- 5. Deduplication check within last 3 seconds
  select id into v_recent_message_id
  from public.messages
  where conversation_id = v_conversation_id
    and sender_id = v_sender_id
    and story_id = p_story_id
    and content = v_clean_content
    and created_at > (now() - interval '3 seconds')
  order by created_at desc
  limit 1;

  if v_recent_message_id is not null then
    return jsonb_build_object(
      'success', true,
      'deduplicated', true,
      'message_id', v_recent_message_id,
      'conversation_id', v_conversation_id
    );
  end if;

  -- 6. Build snapshot metadata of the story
  v_metadata := jsonb_build_object(
    'story_id', v_story.id,
    'image_path', v_story.image_path,
    'caption', v_story.caption,
    'sender_id', v_story.sender_id,
    'expires_at', v_story.expires_at,
    'reaction', nullif(trim(p_reaction), '')
  );

  -- 7. Insert real message into conversation
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
  )
  returning id into v_message_id;

  -- Update conversation activity timestamp
  update public.conversations
  set updated_at = statement_timestamp()
  where id = v_conversation_id;

  return jsonb_build_object(
    'success', true,
    'message_id', v_message_id,
    'conversation_id', v_conversation_id,
    'story_id', p_story_id
  );
end;
$$;

revoke all on function public.send_story_reply(uuid, text, text) from public, anon;
grant execute on function public.send_story_reply(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC: get_story_for_viewer
-- Safely fetches a story's status for a viewer clicking a story reference in Messenger.
-- Enforces expiration, audience, and block checks.
-- ----------------------------------------------------------------------------

create or replace function public.get_story_for_viewer(p_story_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_story record;
  v_sender record;
  v_has_access boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('available', false, 'reason', 'unauthenticated');
  end if;

  select * into v_story
  from public.instants
  where id = p_story_id and is_story = true;

  if not found then
    return jsonb_build_object('available', false, 'reason', 'not_found');
  end if;

  if v_story.expires_at <= now() then
    return jsonb_build_object('available', false, 'reason', 'expired');
  end if;

  -- Check authorization: owner or recipient in instant_recipients, and not blocked
  if v_story.sender_id = v_user_id then
    v_has_access := true;
  else
    select exists (
      select 1 from public.instant_recipients ir
      where ir.instant_id = p_story_id and ir.recipient_id = v_user_id
    ) into v_has_access;

    if not v_has_access then
      -- Fallback friendship check
      select exists (
        select 1 from public.friendships f
        where (f.user_low = least(v_user_id, v_story.sender_id) and f.user_high = greatest(v_user_id, v_story.sender_id))
      ) into v_has_access;
    end if;
  end if;

  if not v_has_access then
    return jsonb_build_object('available', false, 'reason', 'unauthorized');
  end if;

  -- Check if blocked
  if exists (
    select 1 from public.blocked_users bu
    where (bu.blocker_id = v_user_id and bu.blocked_id = v_story.sender_id)
       or (bu.blocker_id = v_story.sender_id and bu.blocked_id = v_user_id)
  ) then
    return jsonb_build_object('available', false, 'reason', 'blocked');
  end if;

  -- Fetch sender profile
  select id, username, display_name, avatar_url into v_sender
  from public.profiles
  where id = v_story.sender_id;

  return jsonb_build_object(
    'available', true,
    'story', jsonb_build_object(
      'id', v_story.id,
      'sender_id', v_story.sender_id,
      'image_path', v_story.image_path,
      'caption', v_story.caption,
      'audience_type', v_story.audience_type,
      'created_at', v_story.created_at,
      'expires_at', v_story.expires_at,
      'is_story', true,
      'sender', jsonb_build_object(
        'id', v_sender.id,
        'username', v_sender.username,
        'display_name', v_sender.display_name,
        'avatar_url', v_sender.avatar_url
      )
    )
  );
end;
$$;

revoke all on function public.get_story_for_viewer(uuid) from public, anon;
grant execute on function public.get_story_for_viewer(uuid) to authenticated;

commit;
