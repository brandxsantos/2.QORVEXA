alter table public.notifications
  add column if not exists post_id uuid references public.posts (id) on delete cascade,
  add column if not exists conversation_id uuid references public.conversations (id) on delete cascade,
  add column if not exists preview text;

create index if not exists notifications_message_conversation_unread_idx
  on public.notifications (user_id, conversation_id)
  where type = 'message' and not is_read;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('friend_request', 'friend_request_accepted', 'post_like', 'comment', 'reply', 'message'));

create or replace function public.notify_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author_id uuid;
  notification_type text;
begin
  select author_id into post_author_id
  from public.posts
  where id = new.post_id;

  if tg_table_name = 'post_likes' then
    notification_type := 'post_like';
    if post_author_id is not null and post_author_id <> new.user_id then
      insert into public.notifications (user_id, actor_id, type, reference_id, post_id)
      values (post_author_id, new.user_id, notification_type, new.post_id, new.post_id);
    end if;
  else
    notification_type := case when new.parent_id is null then 'comment' else 'reply' end;
    if post_author_id is not null and post_author_id <> new.author_id then
      insert into public.notifications (user_id, actor_id, type, reference_id, post_id, preview)
      values (post_author_id, new.author_id, notification_type, new.id, new.post_id, left(new.content, 160));
    end if;
    if new.parent_id is not null then
      insert into public.notifications (user_id, actor_id, type, reference_id, post_id, preview)
      select parent.author_id, new.author_id, 'reply', new.id, new.post_id, left(new.content, 160)
      from public.comments parent
      where parent.id = new.parent_id
        and parent.author_id <> new.author_id
        and parent.author_id <> post_author_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.notify_message_recipient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case
      when c.user_low = new.sender_id then c.user_high
      when c.user_high = new.sender_id then c.user_low
      else null
    end
  into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is not null then
    insert into public.notifications (user_id, actor_id, type, reference_id, conversation_id)
    values (recipient_id, new.sender_id, 'message', new.id, new.conversation_id);
  end if;
  return new;
end;
$$;

revoke all on function public.notify_post_activity() from public, anon, authenticated;
revoke all on function public.notify_message_recipient() from public, anon, authenticated;

drop trigger if exists post_likes_notify_author on public.post_likes;
create trigger post_likes_notify_author
  after insert on public.post_likes
  for each row execute function public.notify_post_activity();

drop trigger if exists comments_notify_authors on public.comments;
create trigger comments_notify_authors
  after insert on public.comments
  for each row execute function public.notify_post_activity();

drop trigger if exists messages_notify_recipient on public.messages;
create trigger messages_notify_recipient
  after insert on public.messages
  for each row execute function public.notify_message_recipient();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
    ) then
      alter publication supabase_realtime add table public.posts;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'post_likes'
    ) then
      alter publication supabase_realtime add table public.post_likes;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
    ) then
      alter publication supabase_realtime add table public.comments;
    end if;
  end if;
end;
$$;
