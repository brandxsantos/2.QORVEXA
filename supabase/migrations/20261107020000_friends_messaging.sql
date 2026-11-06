create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_not_self check (sender_id <> receiver_id)
);

create unique index friend_requests_pending_pair_idx
  on public.friend_requests (sender_id, receiver_id)
  where status = 'pending';
create index friend_requests_receiver_status_idx
  on public.friend_requests (receiver_id, status, created_at desc);
create index friend_requests_sender_status_idx
  on public.friend_requests (sender_id, status, created_at desc);

create table public.friendships (
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_pair_pk primary key (user_low, user_high),
  constraint friendships_ordered_pair check (user_low < user_high)
);

create index friendships_user_high_idx on public.friendships (user_high, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in ('friend_request', 'friend_request_accepted')),
  reference_id uuid not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where not is_read;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  user_low_last_read_at timestamptz not null default now(),
  user_high_last_read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_ordered_pair check (user_low < user_high),
  constraint conversations_unique_pair unique (user_low, user_high)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_content_length check (
    char_length(btrim(content)) between 1 and 4000
  )
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

alter table public.profiles
  add column if not exists last_active_at timestamptz not null default now();

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.friend_requests, public.friendships, public.notifications,
  public.conversations, public.messages from public, anon, authenticated;

grant select on public.friend_requests, public.friendships, public.conversations to authenticated;
grant select, update (is_read) on public.notifications to authenticated;
grant select, delete on public.messages to authenticated;
grant insert (conversation_id, sender_id, content) on public.messages to authenticated;

create function qorvexa_private.are_friends(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where user_low = least(first_user, second_user)
      and user_high = greatest(first_user, second_user)
  );
$$;

revoke all on function qorvexa_private.are_friends(uuid, uuid) from public, anon, authenticated;

create policy "Participants can read their friend requests"
  on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (sender_id, receiver_id));

create policy "Friends can read their friendship rows"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy "Users can read their notifications"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can mark their notifications read"
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Conversation members can read their conversations"
  on public.conversations for select to authenticated
  using (
    (select auth.uid()) in (user_low, user_high)
    and exists (
      select 1 from public.friendships f
      where f.user_low = conversations.user_low and f.user_high = conversations.user_high
    )
  );

create policy "Conversation members can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

create policy "Friends can send messages in their conversation"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

create policy "Members can delete their own messages"
  on public.messages for delete to authenticated
  using (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

create policy "Conversation friends can receive typing broadcasts"
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
    )
  );

create policy "Conversation friends can send typing broadcasts"
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
    )
  );

create policy "Signed-in users can view QORVEXA presence"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
  );

create policy "Signed-in users can publish QORVEXA presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
  );

create function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null or target_user_id is null then
    raise exception 'Sign in and select a user to send a request.';
  end if;
  if current_user_id = target_user_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'That user profile could not be found.';
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
    raise exception 'A pending friend request already exists between these users.';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (current_user_id, target_user_id)
  returning id into request_id;

  insert into public.notifications (user_id, actor_id, type, reference_id)
  values (target_user_id, current_user_id, 'friend_request', request_id);

  return request_id;
end;
$$;

create function public.respond_to_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_row public.friend_requests%rowtype;
begin
  select * into request_row
  from public.friend_requests
  where id = request_id
  for update;

  if not found or request_row.receiver_id <> current_user_id or request_row.status <> 'pending' then
    raise exception 'This pending friend request is unavailable.';
  end if;

  if accept_request then
    insert into public.friendships (user_low, user_high)
    values (
      least(request_row.sender_id, request_row.receiver_id),
      greatest(request_row.sender_id, request_row.receiver_id)
    )
    on conflict do nothing;

    update public.friend_requests
      set status = 'accepted', updated_at = statement_timestamp()
      where id = request_id;

    insert into public.notifications (user_id, actor_id, type, reference_id)
    values (request_row.sender_id, current_user_id, 'friend_request_accepted', request_id);
  else
    update public.friend_requests
      set status = 'declined', updated_at = statement_timestamp()
      where id = request_id;
  end if;
end;
$$;

create function public.cancel_friend_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.friend_requests
  set status = 'canceled', updated_at = statement_timestamp()
  where id = request_id
    and sender_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'This outgoing friend request cannot be canceled.';
  end if;
end;
$$;

create function public.remove_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where user_low = least(auth.uid(), target_user_id)
    and user_high = greatest(auth.uid(), target_user_id);

  if not found then
    raise exception 'This friendship no longer exists.';
  end if;
end;
$$;

create function public.start_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null or current_user_id = target_user_id then
    raise exception 'Choose another signed-in user.';
  end if;
  if not qorvexa_private.are_friends(current_user_id, target_user_id) then
    raise exception 'You can message accepted friends only.';
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

create function public.mark_conversation_read(target_conversation_id uuid)
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
    and exists (
      select 1 from public.friendships f
      where f.user_low = conversations.user_low and f.user_high = conversations.user_high
    );

  if not found then
    raise exception 'Conversation not found or access denied.';
  end if;
end;
$$;

create function public.get_conversation_summaries()
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
    and exists (
      select 1 from public.friendships f
      where f.user_low = c.user_low and f.user_high = c.user_high
    )
  group by c.id, latest.id, latest.content, latest.sender_id, latest.created_at;
$$;

create function public.touch_last_active()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
  set last_active_at = statement_timestamp()
  where id = auth.uid();
$$;

create function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function public.cancel_friend_request(uuid) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.get_conversation_summaries() from public, anon;
revoke all on function public.touch_last_active() from public, anon;
revoke all on function public.touch_conversation_after_message() from public, anon, authenticated;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.cancel_friend_request(uuid) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.get_conversation_summaries() to authenticated;
grant execute on function public.touch_last_active() to authenticated;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_after_message();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests'
    ) then
      alter publication supabase_realtime add table public.friend_requests;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
    ) then
      alter publication supabase_realtime add table public.friendships;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then
      alter publication supabase_realtime add table public.conversations;
    end if;
  end if;
end;
$$;
