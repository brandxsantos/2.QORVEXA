alter table public.posts
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.posts
  drop constraint if exists posts_content_length;

alter table public.posts
  add constraint posts_content_or_media check (
    (char_length(btrim(content)) between 1 and 1000)
    or (char_length(btrim(content)) = 0 and media_path is not null)
  ),
  add constraint posts_media_type check (
    (media_path is null and media_type is null)
    or (media_path is not null and media_type = 'image')
  );

grant insert (author_id, content, media_path, media_type) on public.posts to authenticated;

drop policy if exists "Members can publish posts as themselves" on public.posts;
create policy "Members can publish posts as themselves"
  on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.can_current_user_post())
    and (
      media_path is null
      or (
        media_type = 'image'
        and media_path like (select auth.uid())::text || '/posts/%'
      )
    )
  );

create table public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_likes_unique_user_post unique (post_id, user_id)
);

create index post_likes_post_created_idx on public.post_likes (post_id, created_at desc);
create index post_likes_user_created_idx on public.post_likes (user_id, created_at desc);

create table public.post_bookmarks (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_bookmarks_user_created_idx on public.post_bookmarks (user_id, created_at desc);

create table public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

create index blocked_users_blocked_idx on public.blocked_users (blocked_id, blocker_id);

alter table public.post_likes enable row level security;
alter table public.post_bookmarks enable row level security;
alter table public.blocked_users enable row level security;

revoke all on public.post_likes, public.post_bookmarks, public.blocked_users
  from public, anon, authenticated;
grant select on public.post_likes to authenticated;
grant insert (post_id, user_id), delete on public.post_likes to authenticated;
grant select, insert (post_id, user_id), delete on public.post_bookmarks to authenticated;
grant select on public.blocked_users to authenticated;

create function qorvexa_private.are_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = first_user and blocked_id = second_user)
       or (blocker_id = second_user and blocked_id = first_user)
  );
$$;

create function public.can_view_member(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null
    and (auth.uid() is null or target_user_id = auth.uid()
      or not qorvexa_private.are_blocked(auth.uid(), target_user_id));
$$;

revoke all on function qorvexa_private.are_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_view_member(uuid) from public;
grant execute on function public.can_view_member(uuid) to anon, authenticated;

create policy "Members can read their own likes and visible post likes"
  on public.post_likes for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_member(p.author_id)
    )
  );

create policy "Members can like visible posts as themselves"
  on public.post_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and not p.is_hidden
        and public.can_view_member(p.author_id)
    )
  );

create policy "Members can remove their own likes"
  on public.post_likes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Members can read their own bookmarks"
  on public.post_bookmarks for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Members can bookmark visible posts as themselves"
  on public.post_bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and not p.is_hidden
        and public.can_view_member(p.author_id)
    )
  );

create policy "Members can remove their own bookmarks"
  on public.post_bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Members can view their own block list"
  on public.blocked_users for select to authenticated
  using (blocker_id = (select auth.uid()));

drop policy if exists "Public profiles are viewable" on public.profiles;
create policy "Profiles are visible unless either member blocked the other"
  on public.profiles for select to anon, authenticated
  using (public.can_view_member(id));

drop policy if exists "Signed-in members can read visible posts" on public.posts;
create policy "Signed-in members can read visible posts"
  on public.posts for select to authenticated
  using (
    public.can_view_member(author_id)
    and (not is_hidden or (select public.is_current_content_moderator()))
  );

drop policy if exists "Signed-in members can read visible comments" on public.comments;
create policy "Signed-in members can read visible comments"
  on public.comments for select to authenticated
  using (
    public.can_view_member(author_id)
    and (not is_hidden or (select public.is_current_content_moderator()))
  );

drop policy if exists "Members can comment as themselves" on public.comments;
create policy "Members can comment on visible posts as themselves"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and (select public.can_current_user_comment())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and public.can_view_member(p.author_id)
    )
  );

drop policy if exists "Participants can read their friend requests" on public.friend_requests;
create policy "Participants can read unblocked friend requests"
  on public.friend_requests for select to authenticated
  using (
    (select auth.uid()) in (sender_id, receiver_id)
    and public.can_view_member(case when sender_id = (select auth.uid()) then receiver_id else sender_id end)
  );

drop policy if exists "Friends can read their friendship rows" on public.friendships;
create policy "Friends can read unblocked friendship rows"
  on public.friendships for select to authenticated
  using (
    (select auth.uid()) in (user_low, user_high)
    and public.can_view_member(case when user_low = (select auth.uid()) then user_high else user_low end)
  );

drop policy if exists "Users can read their notifications" on public.notifications;
create policy "Users can read notifications from unblocked members"
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and (actor_id is null or public.can_view_member(actor_id))
  );

drop policy if exists "Conversation members can read their conversations" on public.conversations;
create policy "Unblocked friends can read their conversations"
  on public.conversations for select to authenticated
  using (
    (select auth.uid()) in (user_low, user_high)
    and public.can_view_member(case when user_low = (select auth.uid()) then user_high else user_low end)
    and exists (
      select 1 from public.friendships f
      where f.user_low = conversations.user_low and f.user_high = conversations.user_high
    )
  );

drop policy if exists "Conversation members can read messages" on public.messages;
create policy "Unblocked friends can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

drop policy if exists "Friends can send messages in their conversation" on public.messages;
create policy "Unblocked friends can send messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.can_current_user_message())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

drop policy if exists "Members can delete their own messages" on public.messages;
create policy "Members can delete their own messages in unblocked conversations"
  on public.messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

create function public.block_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null or target_user_id is null or target_user_id = current_user_id then
    raise exception 'Choose another signed-in member to block.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'That member could not be found.';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
  values (current_user_id, target_user_id)
  on conflict do nothing;

  delete from public.friendships
  where user_low = least(current_user_id, target_user_id)
    and user_high = greatest(current_user_id, target_user_id);

  update public.friend_requests
  set status = 'canceled', updated_at = statement_timestamp()
  where status = 'pending'
    and ((sender_id = current_user_id and receiver_id = target_user_id)
      or (sender_id = target_user_id and receiver_id = current_user_id));
end;
$$;

create function public.unblock_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.blocked_users
  where blocker_id = auth.uid() and blocked_id = target_user_id;
  if not found then
    raise exception 'That member is not in your blocked list.';
  end if;
end;
$$;

create function public.get_blocked_members()
returns table (user_id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, b.created_at
  from public.blocked_users b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null or target_user_id is null or current_user_id = target_user_id then
    raise exception 'Choose another signed-in member to send a request.';
  end if;
  if qorvexa_private.are_blocked(current_user_id, target_user_id) then
    raise exception 'Friend requests are unavailable between these members.';
  end if;
  if exists (
    select 1 from public.user_restrictions
    where user_id = current_user_id and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = 'friend_requests'
  ) then
    raise exception 'Friend requests are unavailable for this account due to an active restriction.';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'That member could not be found.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(current_user_id::text, target_user_id::text) || ':' ||
    greatest(current_user_id::text, target_user_id::text), 0
  ));
  if qorvexa_private.are_friends(current_user_id, target_user_id) then
    raise exception 'You are already friends.';
  end if;
  if exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((sender_id = current_user_id and receiver_id = target_user_id)
        or (sender_id = target_user_id and receiver_id = current_user_id))
  ) then
    raise exception 'A pending friend request already exists between these members.';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (current_user_id, target_user_id)
  returning id into request_id;
  insert into public.notifications (user_id, actor_id, type, reference_id)
  values (target_user_id, current_user_id, 'friend_request', request_id);
  return request_id;
end;
$$;

create or replace function public.respond_to_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_row public.friend_requests%rowtype;
begin
  select * into request_row from public.friend_requests where id = request_id for update;
  if not found or request_row.receiver_id <> current_user_id or request_row.status <> 'pending'
      or qorvexa_private.are_blocked(current_user_id, request_row.sender_id) then
    raise exception 'This pending friend request is unavailable.';
  end if;

  if accept_request then
    insert into public.friendships (user_low, user_high)
    values (least(request_row.sender_id, request_row.receiver_id), greatest(request_row.sender_id, request_row.receiver_id))
    on conflict do nothing;
    update public.friend_requests set status = 'accepted', updated_at = statement_timestamp() where id = request_id;
    insert into public.notifications (user_id, actor_id, type, reference_id)
    values (request_row.sender_id, current_user_id, 'friend_request_accepted', request_id);
  else
    update public.friend_requests set status = 'declined', updated_at = statement_timestamp() where id = request_id;
  end if;
end;
$$;

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
  insert into public.conversations (user_low, user_high)
  values (least(current_user_id, target_user_id), greatest(current_user_id, target_user_id))
  on conflict (user_low, user_high) do nothing
  returning id into conversation_id;
  if conversation_id is null then
    select id into conversation_id from public.conversations
    where user_low = least(current_user_id, target_user_id)
      and user_high = greatest(current_user_id, target_user_id);
  end if;
  return conversation_id;
end;
$$;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set user_low_last_read_at = case
        when user_low = auth.uid() then statement_timestamp()
        else user_low_last_read_at end,
      user_high_last_read_at = case
        when user_high = auth.uid() then statement_timestamp()
        else user_high_last_read_at end
  where id = target_conversation_id
    and auth.uid() in (user_low, user_high)
    and not qorvexa_private.are_blocked(user_low, user_high)
    and exists (
      select 1 from public.friendships f
      where f.user_low = conversations.user_low and f.user_high = conversations.user_high
    );
  if not found then
    raise exception 'Conversation not found or access denied.';
  end if;
end;
$$;

create or replace function public.get_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
    latest.id,
    latest.content,
    latest.sender_id,
    latest.created_at,
    count(unread.id)::bigint
  from public.conversations c
  left join lateral (
    select m.id, m.content, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join public.messages unread
    on unread.conversation_id = c.id
    and unread.sender_id <> auth.uid()
    and unread.created_at > case
      when c.user_low = auth.uid() then c.user_low_last_read_at
      else c.user_high_last_read_at
    end
  where auth.uid() in (c.user_low, c.user_high)
    and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
    and exists (
      select 1 from public.friendships f
      where f.user_low = c.user_low and f.user_high = c.user_high
    )
  group by c.id, latest.id, latest.content, latest.sender_id, latest.created_at;
$$;

drop policy if exists "Conversation friends can receive typing broadcasts" on realtime.messages;
create policy "Unblocked friends can receive typing broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.conversations c
      join public.friendships f
        on f.user_low = c.user_low and f.user_high = c.user_high
      where realtime.topic() = 'conversation-' || c.id::text
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
    )
  );

drop policy if exists "Conversation friends can send typing broadcasts" on realtime.messages;
create policy "Unblocked friends can send typing broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.conversations c
      join public.friendships f
        on f.user_low = c.user_low and f.user_high = c.user_high
      where realtime.topic() = 'conversation-' || c.id::text
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
    )
  );

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('friend_request', 'friend_request_accepted', 'post_like', 'comment', 'reply'));

create function public.notify_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  notification_type text;
begin
  if tg_table_name = 'post_likes' then
    select author_id into post_author_id from public.posts where id = new.post_id;
    notification_type := 'post_like';
    if post_author_id is not null and post_author_id <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, reference_id)
      values (post_author_id, new.user_id, notification_type, new.post_id);
    end if;
  else
    select author_id into post_author_id from public.posts where id = new.post_id;
    notification_type := case when new.parent_id is null then 'comment' else 'reply' end;
    if post_author_id is not null and post_author_id <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, reference_id)
      values (post_author_id, new.author_id, notification_type, new.id);
    end if;
    if new.parent_id is not null then
      insert into public.notifications (user_id, actor_id, type, reference_id)
      select parent.author_id, new.author_id, 'reply', new.id
      from public.comments parent
      where parent.id = new.parent_id
        and parent.author_id <> new.author_id
        and parent.author_id <> post_author_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_post_activity() from public, anon, authenticated;

create trigger post_likes_notify_author
  after insert on public.post_likes
  for each row execute function public.notify_post_activity();
create trigger comments_notify_authors
  after insert on public.comments
  for each row execute function public.notify_post_activity();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qorvexa-media',
  'qorvexa-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view QORVEXA media"
  on storage.objects for select
  using (bucket_id = 'qorvexa-media');

create policy "Members can upload their own QORVEXA media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qorvexa-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members can update their own QORVEXA media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'qorvexa-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'qorvexa-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Members can delete their own QORVEXA media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'qorvexa-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

grant execute on function public.block_member(uuid) to authenticated;
grant execute on function public.unblock_member(uuid) to authenticated;
grant execute on function public.get_blocked_members() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_conversation_summaries() to authenticated;
grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

revoke all on function public.block_member(uuid) from public, anon;
revoke all on function public.unblock_member(uuid) from public, anon;
revoke all on function public.get_blocked_members() from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.get_conversation_summaries() from public, anon;
revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
