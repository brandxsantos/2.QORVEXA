-- ============================================================================
-- QORVEXA: Message Delivery and Read Status Synchronization
-- Adds recipient delivery watermark to conversations table
-- and updates mark_conversation_read & mark_conversation_delivered RPCs
-- ============================================================================

begin;

-- 1. Add delivery timestamp columns to conversations
alter table public.conversations
  add column if not exists user_low_last_delivered_at timestamptz not null default now(),
  add column if not exists user_high_last_delivered_at timestamptz not null default now();

-- 2. Function to mark a single conversation as delivered by current user
create or replace function public.mark_conversation_delivered(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set user_low_last_delivered_at = case
        when user_low = auth.uid() then statement_timestamp()
        else user_low_last_delivered_at end,
      user_high_last_delivered_at = case
        when user_high = auth.uid() then statement_timestamp()
        else user_high_last_delivered_at end
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

-- 3. Function to mark multiple conversations delivered in one call (e.g. on sync/reconnect)
create or replace function public.mark_conversations_delivered(target_conversation_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set user_low_last_delivered_at = case
        when user_low = auth.uid() then statement_timestamp()
        else user_low_last_delivered_at end,
      user_high_last_delivered_at = case
        when user_high = auth.uid() then statement_timestamp()
        else user_high_last_delivered_at end
  where id = any(target_conversation_ids)
    and auth.uid() in (user_low, user_high)
    and exists (
      select 1 from public.friendships f
      where f.user_low = conversations.user_low and f.user_high = conversations.user_high
    );
end;
$$;

-- 4. Update mark_conversation_read to also advance delivery watermark
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
        else user_high_last_read_at end,
      user_low_last_delivered_at = case
        when user_low = auth.uid() then statement_timestamp()
        else user_low_last_delivered_at end,
      user_high_last_delivered_at = case
        when user_high = auth.uid() then statement_timestamp()
        else user_high_last_delivered_at end
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

grant execute on function public.mark_conversation_delivered(uuid) to authenticated;
grant execute on function public.mark_conversations_delivered(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

commit;
