-- QORVEXA: INSTANTS FEATURE MIGRATION
-- Camera-first spontaneous photo sharing with view-once and 24-hour expiration.

create schema if not exists qorvexa_private;

-- ============================================================================
-- 1. TABLES (Created first before cross-table policies/helpers)
-- ============================================================================

-- 1a. Close Friends Table
create table if not exists public.close_friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint close_friends_not_self check (user_id <> friend_id)
);

create index if not exists close_friends_user_idx on public.close_friends (user_id);
create index if not exists close_friends_friend_idx on public.close_friends (friend_id);

-- 1b. Instants Table
create table if not exists public.instants (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  caption text,
  audience_type text not null default 'friends' check (audience_type in ('friends', 'close_friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint instants_caption_len check (caption is null or char_length(caption) <= 300)
);

create index if not exists instants_sender_idx on public.instants (sender_id, created_at desc);
create index if not exists instants_expires_idx on public.instants (expires_at);

-- 1c. Instant Recipients Table (Tracks View-Once and Delivery per recipient)
create table if not exists public.instant_recipients (
  id uuid primary key default gen_random_uuid(),
  instant_id uuid not null references public.instants(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  is_viewed boolean not null default false,
  viewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint instant_recipients_unique unique (instant_id, recipient_id)
);

create index if not exists instant_recipients_user_idx on public.instant_recipients (recipient_id, is_viewed, created_at desc);
create index if not exists instant_recipients_instant_idx on public.instant_recipients (instant_id);

-- 1d. Instant Reactions Table
create table if not exists public.instant_reactions (
  id uuid primary key default gen_random_uuid(),
  instant_id uuid not null references public.instants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 10),
  created_at timestamptz not null default now(),
  constraint instant_reactions_unique unique (instant_id, user_id)
);

create index if not exists instant_reactions_instant_idx on public.instant_reactions (instant_id);

-- ============================================================================
-- 2. PRIVATE SECURITY HELPERS (Prevents RLS infinite recursion across tables)
-- ============================================================================

create or replace function qorvexa_private.is_instant_sender(
  p_instant_id uuid,
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
    where i.id = p_instant_id
      and i.sender_id = coalesce(p_user_id, auth.uid())
  );
$$;

revoke all on function qorvexa_private.is_instant_sender(uuid, uuid) from public, anon;
grant execute on function qorvexa_private.is_instant_sender(uuid, uuid) to authenticated;

create or replace function qorvexa_private.is_instant_recipient(
  p_instant_id uuid,
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
    from public.instant_recipients ir
    where ir.instant_id = p_instant_id
      and ir.recipient_id = coalesce(p_user_id, auth.uid())
  );
$$;

revoke all on function qorvexa_private.is_instant_recipient(uuid, uuid) from public, anon;
grant execute on function qorvexa_private.is_instant_recipient(uuid, uuid) to authenticated;

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
        not ir.is_viewed
        or ir.viewed_at >= (now() - interval '2 minutes')
      )
  );
$$;

revoke all on function qorvexa_private.can_access_instant_photo(text, uuid) from public, anon;
grant execute on function qorvexa_private.can_access_instant_photo(text, uuid) to authenticated;

-- ============================================================================
-- 3. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- 3a. Close Friends RLS
alter table public.close_friends enable row level security;
revoke all on public.close_friends from public, anon;
grant select, insert, delete on public.close_friends to authenticated;

drop policy if exists "Users can manage own close friends" on public.close_friends;
create policy "Users can manage own close friends"
  on public.close_friends for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3b. Instants RLS
alter table public.instants enable row level security;
revoke all on public.instants from public, anon;
grant select, delete on public.instants to authenticated;

drop policy if exists "Members can read visible instants" on public.instants;
create policy "Members can read visible instants"
  on public.instants for select to authenticated
  using (
    sender_id = (select auth.uid())
    or qorvexa_private.is_instant_recipient(id, (select auth.uid()))
  );

drop policy if exists "Senders can delete own instants" on public.instants;
create policy "Senders can delete own instants"
  on public.instants for delete to authenticated
  using (sender_id = (select auth.uid()));

-- 3c. Instant Recipients RLS
alter table public.instant_recipients enable row level security;
revoke all on public.instant_recipients from public, anon;
grant select on public.instant_recipients to authenticated;

drop policy if exists "Recipients and senders can read recipient state" on public.instant_recipients;
create policy "Recipients and senders can read recipient state"
  on public.instant_recipients for select to authenticated
  using (
    recipient_id = (select auth.uid())
    or qorvexa_private.is_instant_sender(instant_id, (select auth.uid()))
  );

-- 3d. Instant Reactions RLS
alter table public.instant_reactions enable row level security;
revoke all on public.instant_reactions from public, anon;
grant select, insert, update, delete on public.instant_reactions to authenticated;

drop policy if exists "Participants can view instant reactions" on public.instant_reactions;
create policy "Participants can view instant reactions"
  on public.instant_reactions for select to authenticated
  using (
    user_id = (select auth.uid())
    or qorvexa_private.is_instant_sender(instant_id, (select auth.uid()))
    or qorvexa_private.is_instant_recipient(instant_id, (select auth.uid()))
  );

drop policy if exists "Authorized recipients or sender can react" on public.instant_reactions;
create policy "Authorized recipients or sender can react"
  on public.instant_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      qorvexa_private.is_instant_recipient(instant_id, (select auth.uid()))
      or qorvexa_private.is_instant_sender(instant_id, (select auth.uid()))
    )
  );

drop policy if exists "Users can update own reaction" on public.instant_reactions;
create policy "Users can update own reaction"
  on public.instant_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove own reaction" on public.instant_reactions;
create policy "Users can remove own reaction"
  on public.instant_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- 4. NOTIFICATIONS CONSTRAINT UPDATE
-- ============================================================================

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
        'instant_reaction'
      ));
  end if;
end;
$$;

-- ============================================================================
-- 5. STORAGE BUCKET CONFIGURATION (Private qorvexa-instants bucket)
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qorvexa-instants',
  'qorvexa-instants',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Members can upload their own Instants photos" on storage.objects;
create policy "Members can upload their own Instants photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qorvexa-instants'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authorized viewers can access Instants photos" on storage.objects;
create policy "Authorized viewers can access Instants photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qorvexa-instants'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or qorvexa_private.can_access_instant_photo(name, (select auth.uid()))
    )
  );

drop policy if exists "Senders can delete own Instants photos" on storage.objects;
create policy "Senders can delete own Instants photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'qorvexa-instants'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================================
-- 6. RPC: Create Instant
-- ============================================================================

create or replace function public.create_instant(
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
  v_instant_id uuid;
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
    raise exception 'Photo image path is required.';
  end if;

  v_expires_at := now() + interval '24 hours';

  -- Insert instant
  insert into public.instants (
    sender_id, image_path, caption, audience_type, expires_at
  ) values (
    v_sender_id, p_image_path, nullif(trim(p_caption), ''), p_audience_type, v_expires_at
  ) returning id into v_instant_id;

  -- Determine eligible recipients
  if p_audience_type = 'close_friends' then
    insert into public.instant_recipients (instant_id, recipient_id)
    select v_instant_id, cf.friend_id
    from public.close_friends cf
    where cf.user_id = v_sender_id
      and exists (
        select 1 from public.friendships f
        where ((f.user_low = least(v_sender_id, cf.friend_id) and f.user_high = greatest(v_sender_id, cf.friend_id)))
          and f.status = 'accepted'
      )
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker_id = v_sender_id and bu.blocked_id = cf.friend_id)
           or (bu.blocker_id = cf.friend_id and bu.blocked_id = v_sender_id)
      );
  else
    insert into public.instant_recipients (instant_id, recipient_id)
    select v_instant_id,
           case when f.user_low = v_sender_id then f.user_high else f.user_low end as recipient_id
    from public.friendships f
    where (f.user_low = v_sender_id or f.user_high = v_sender_id)
      and f.status = 'accepted'
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker_id = v_sender_id and bu.blocked_id = (case when f.user_low = v_sender_id then f.user_high else f.user_low end))
           or (bu.blocker_id = (case when f.user_low = v_sender_id then f.user_high else f.user_low end) and bu.blocked_id = v_sender_id)
      );
  end if;

  get diagnostics v_recipient_count = row_count;

  if v_recipient_count = 0 then
    -- Clean up and inform sender
    delete from public.instants where id = v_instant_id;
    if p_audience_type = 'close_friends' then
      raise exception 'You do not have any accepted friends in your Close Friends list.';
    else
      raise exception 'You do not have any accepted friends to receive this Instant.';
    end if;
  end if;

  -- Emit non-sensitive notifications to eligible recipients if notifications table exists
  if to_regclass('public.notifications') is not null then
    insert into public.notifications (user_id, actor_id, type, reference_id, preview)
    select ir.recipient_id,
           v_sender_id,
           'instant',
           v_instant_id,
           case
             when p_audience_type = 'close_friends' then 'Close Friends Instant · View once'
             else 'New Instant photo · View once'
           end
    from public.instant_recipients ir
    where ir.instant_id = v_instant_id;
  end if;

  return jsonb_build_object(
    'instant_id', v_instant_id,
    'recipient_count', v_recipient_count,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.create_instant(text, text, text) from public, anon;
grant execute on function public.create_instant(text, text, text) to authenticated;

-- ============================================================================
-- 7. RPC: Consume and View Instant (Atomic Server-Side View-Once Enforcement)
-- ============================================================================

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

  -- Select and lock recipient row for update to prevent concurrent double-viewing
  select * into v_recipient_record
  from public.instant_recipients
  where instant_id = p_instant_id
    and recipient_id = v_user_id
  for update;

  if v_recipient_record is null then
    raise exception 'You are not an authorized recipient of this Instant.';
  end if;

  -- Load instant
  select * into v_instant_record
  from public.instants
  where id = p_instant_id;

  if v_instant_record is null then
    raise exception 'Instant not found.';
  end if;

  if v_instant_record.expires_at < now() then
    raise exception 'This Instant has expired.';
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

-- ============================================================================
-- 8. RPC: Get Active Instants Inbox (For top of Messages)
-- ============================================================================

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
      'sender', jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url
      ),
      'my_reaction', (
        select reaction
        from public.instant_reactions r
        where r.instant_id = i.id and r.user_id = v_user_id
      )
    ) order by ir.is_viewed asc, i.created_at desc
  ), '[]'::jsonb) into v_result
  from public.instant_recipients ir
  join public.instants i on i.id = ir.instant_id
  join public.profiles p on p.id = i.sender_id
  where ir.recipient_id = v_user_id
    and i.expires_at > now()
    and not exists (
      select 1 from public.blocked_users bu
      where (bu.blocker_id = v_user_id and bu.blocked_id = i.sender_id)
         or (bu.blocker_id = i.sender_id and bu.blocked_id = v_user_id)
    );

  return v_result;
end;
$$;

revoke all on function public.get_active_instants_inbox() from public, anon;
grant execute on function public.get_active_instants_inbox() to authenticated;

-- ============================================================================
-- 9. RPC: Get Sent Instants Archive (Sender's Private Archive)
-- ============================================================================

create or replace function public.get_sent_instants_archive()
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
      'image_path', i.image_path,
      'caption', i.caption,
      'audience_type', i.audience_type,
      'created_at', i.created_at,
      'expires_at', i.expires_at,
      'is_expired', (i.expires_at <= now()),
      'total_recipients', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id
      ),
      'viewed_count', (
        select count(*) from public.instant_recipients ir where ir.instant_id = i.id and ir.is_viewed
      ),
      'recipients', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'username', p.username,
            'display_name', p.display_name,
            'avatar_url', p.avatar_url,
            'is_viewed', ir.is_viewed,
            'viewed_at', ir.viewed_at
          ) order by ir.is_viewed desc, ir.viewed_at desc
        ), '[]'::jsonb)
        from public.instant_recipients ir
        join public.profiles p on p.id = ir.recipient_id
        where ir.instant_id = i.id
      ),
      'reactions', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'reaction', r.reaction,
            'user', jsonb_build_object(
              'id', p.id,
              'username', p.username,
              'display_name', p.display_name,
              'avatar_url', p.avatar_url
            )
          )
        ), '[]'::jsonb)
        from public.instant_reactions r
        join public.profiles p on p.id = r.user_id
        where r.instant_id = i.id
      )
    ) order by i.created_at desc
  ), '[]'::jsonb) into v_result
  from public.instants i
  where i.sender_id = v_user_id;

  return v_result;
end;
$$;

revoke all on function public.get_sent_instants_archive() from public, anon;
grant execute on function public.get_sent_instants_archive() to authenticated;

-- ============================================================================
-- 10. RPC: Set or Remove Reaction to an Instant
-- ============================================================================

create or replace function public.set_instant_reaction(
  p_instant_id uuid,
  p_reaction text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_sender_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select sender_id into v_sender_id
  from public.instants
  where id = p_instant_id;

  -- Validate access
  if not exists (
    select 1 from public.instant_recipients ir
    where ir.instant_id = p_instant_id and ir.recipient_id = v_user_id
  ) and v_sender_id is distinct from v_user_id then
    raise exception 'Not authorized to react to this Instant.';
  end if;

  if p_reaction is null or trim(p_reaction) = '' then
    delete from public.instant_reactions
    where instant_id = p_instant_id and user_id = v_user_id;
    return jsonb_build_object('success', true, 'reaction', null);
  end if;

  insert into public.instant_reactions (instant_id, user_id, reaction)
  values (p_instant_id, v_user_id, trim(p_reaction))
  on conflict (instant_id, user_id)
  do update set reaction = excluded.reaction, created_at = now();

  -- Notify sender if recipient reacted
  if v_sender_id is not null and v_sender_id <> v_user_id and to_regclass('public.notifications') is not null then
    insert into public.notifications (user_id, actor_id, type, reference_id, preview)
    values (v_sender_id, v_user_id, 'instant_reaction', p_instant_id, 'Reacted ' || trim(p_reaction) || ' to your Instant');
  end if;

  return jsonb_build_object('success', true, 'reaction', trim(p_reaction));
end;
$$;

revoke all on function public.set_instant_reaction(uuid, text) from public, anon;
grant execute on function public.set_instant_reaction(uuid, text) to authenticated;

-- ============================================================================
-- 11. RPC: Close Friends Management
-- ============================================================================

create or replace function public.get_close_friends()
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
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'added_at', cf.created_at
    ) order by p.display_name asc
  ), '[]'::jsonb) into v_result
  from public.close_friends cf
  join public.profiles p on p.id = cf.friend_id
  where cf.user_id = v_user_id;

  return v_result;
end;
$$;

revoke all on function public.get_close_friends() from public, anon;
grant execute on function public.get_close_friends() to authenticated;

create or replace function public.set_close_friend(
  p_friend_id uuid,
  p_is_close boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_friend_id = v_user_id then
    raise exception 'Cannot add yourself as close friend.';
  end if;

  if p_is_close then
    -- Verify accepted friendship exists
    if not exists (
      select 1 from public.friendships f
      where ((f.user_low = least(v_user_id, p_friend_id) and f.user_high = greatest(v_user_id, p_friend_id)))
        and f.status = 'accepted'
    ) then
      raise exception 'User must be an accepted friend to be added to Close Friends.';
    end if;

    insert into public.close_friends (user_id, friend_id)
    values (v_user_id, p_friend_id)
    on conflict (user_id, friend_id) do nothing;
  else
    delete from public.close_friends
    where user_id = v_user_id and friend_id = p_friend_id;
  end if;

  return true;
end;
$$;

revoke all on function public.set_close_friend(uuid, boolean) from public, anon;
grant execute on function public.set_close_friend(uuid, boolean) to authenticated;

-- ============================================================================
-- 12. RPC: Safe Expiration Cleanup
-- ============================================================================

create or replace function public.cleanup_expired_instants()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count integer := 0;
begin
  -- Delete instants where 24 hours have elapsed since expiration,
  -- or all recipients have already viewed and at least 6 hours have passed
  delete from public.instants
  where expires_at < (now() - interval '24 hours')
     or (
       created_at < (now() - interval '6 hours')
       and not exists (
         select 1 from public.instant_recipients ir
         where ir.instant_id = instants.id and not ir.is_viewed
       )
     );

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_instants() from public, anon;
grant execute on function public.cleanup_expired_instants() to authenticated;

-- ============================================================================
-- 13. REALTIME PUBLICATION
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'instants'
    ) then
      alter publication supabase_realtime add table public.instants;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'instant_recipients'
    ) then
      alter publication supabase_realtime add table public.instant_recipients;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'instant_reactions'
    ) then
      alter publication supabase_realtime add table public.instant_reactions;
    end if;
  end if;
end;
$$;
