begin;

-- Message replies: a reply must point to a message in the same conversation.
alter table public.messages
  add column reply_to_message_id uuid;

alter table public.messages
  add constraint messages_id_conversation_unique
  unique (id, conversation_id);

alter table public.messages
  add constraint messages_reply_same_conversation_fk
  foreign key (reply_to_message_id, conversation_id)
  references public.messages (id, conversation_id)
  on delete set null (reply_to_message_id);

grant insert (reply_to_message_id)
  on public.messages to authenticated;

-- One reaction per member per message.
create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references public.messages (id) on delete cascade,
  user_id uuid not null
    references public.profiles (id) on delete cascade,
  reaction_type text not null
    check (reaction_type in (
      'like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'
    )),
  created_at timestamptz not null default now(),
  constraint message_reactions_unique_user_message
    unique (message_id, user_id)
);

create index message_reactions_message_idx
  on public.message_reactions (message_id, created_at);

create index message_reactions_user_idx
  on public.message_reactions (user_id, created_at desc);

alter table public.message_reactions enable row level security;

revoke all on public.message_reactions
  from public, anon, authenticated;

grant select, delete
  on public.message_reactions to authenticated;

grant insert (message_id, user_id, reaction_type)
  on public.message_reactions to authenticated;

grant update (reaction_type)
  on public.message_reactions to authenticated;

-- Only members who can read the message can read its reactions.
create policy "Members can read reactions on visible messages"
  on public.message_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_id
    )
  );

-- Users can react as themselves, only in conversations they can access.
create policy "Unblocked members can react to messages"
  on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.can_current_user_message())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
    )
  );

-- Users may change only their own reaction.
create policy "Members can change their own message reactions"
  on public.message_reactions for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
    )
  )
  with check (
    user_id = (select auth.uid())
    and (select public.can_current_user_message())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
    )
  );

-- Users may remove their own reaction.
create policy "Members can remove their own message reactions"
  on public.message_reactions for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
    )
  );

-- Publish reactions to Supabase Realtime.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime
      add table public.message_reactions;
  end if;
end;
$$;

commit;
