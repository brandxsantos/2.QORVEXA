-- ============================================================================
-- QORVEXA: Fix Conversation Immediate Open & Touch Activity
-- Brings conversations to the top immediately upon direct opening
-- and ensures start_direct_conversation updates updated_at on existing chats
-- ============================================================================

begin;

-- Ensure last_message_at column exists
alter table public.conversations
  add column if not exists last_message_at timestamptz default now();

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

commit;
