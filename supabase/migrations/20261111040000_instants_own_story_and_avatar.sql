-- ============================================================================
-- QORVEXA: INSTANTS OWN STORY VISIBILITY & SENDER VIEWING
-- Adds get_my_active_instants and enables senders to view their own active stories
-- ============================================================================

begin;

-- 1. RPC: Get caller's own active Instants (stories)
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
    and i.expires_at > now();

  return v_result;
end;
$$;

revoke all on function public.get_my_active_instants() from public, anon;
grant execute on function public.get_my_active_instants() to authenticated;

-- 2. Update consume_and_view_instant to allow senders to view their own stories
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
    raise exception 'Instant not found.';
  end if;

  if v_instant_record.expires_at < now() then
    raise exception 'This Instant has expired.';
  end if;

  -- If caller is the sender, allow viewing their own instant without consuming recipient status
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
    raise exception 'You are not an authorized recipient of this Instant.';
  end if;

  if v_recipient_record.is_viewed then
    raise exception 'This Instant has already been viewed.';
  end if;

  -- Atomically mark as viewed
  update public.instant_recipients
  set is_viewed = true,
      viewed_at = now()
  where id = v_recipient_record.id;

  -- Load sender profile info
  select id, username, display_name, avatar_url into v_sender_record
  from public.profiles
  where id = v_instant_record.sender_id;

  -- Load any existing reaction
  select reaction into v_my_reaction
  from public.instant_reactions
  where instant_id = p_instant_id and user_id = v_user_id;

  return jsonb_build_object(
    'id', v_instant_record.id,
    'image_path', v_instant_record.image_path,
    'caption', v_instant_record.caption,
    'audience_type', v_instant_record.audience_type,
    'created_at', v_instant_record.created_at,
    'expires_at', v_instant_record.expires_at,
    'is_own', false,
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

commit;
