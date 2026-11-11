begin;

-- ============================================================================
-- QORVEXA: Member Blocking Repair
-- Phase 2, Stage 2B — Follow Removal, Active Call Termination & Realtime Sync
-- ============================================================================

-- 1. Replace public.block_member(target_user_id uuid)
create or replace function public.block_member(target_user_id uuid)
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

  -- Operation 1: Terminate active or ringing calls between these exact two users
  update public.call_sessions
  set status = case
                 when status = 'accepted' then 'ended'
                 when caller_id = current_user_id then 'cancelled'
                 else 'declined'
               end,
      ended_at = statement_timestamp()
  where status in ('ringing', 'accepted')
    and ((caller_id = current_user_id and callee_id = target_user_id)
      or (caller_id = target_user_id and callee_id = current_user_id));

  -- Operation 2: Insert block record
  insert into public.blocked_users (blocker_id, blocked_id)
  values (current_user_id, target_user_id)
  on conflict do nothing;

  -- Operation 3: Remove mutual follow relationships
  delete from public.user_follows
  where (follower_id = current_user_id and following_id = target_user_id)
     or (follower_id = target_user_id and following_id = current_user_id);

  -- Operation 4: Remove mutual friendships
  delete from public.friendships
  where user_low = least(current_user_id, target_user_id)
    and user_high = greatest(current_user_id, target_user_id);

  -- Operation 5: Cancel pending friend requests in both directions
  update public.friend_requests
  set status = 'canceled', updated_at = statement_timestamp()
  where status = 'pending'
    and ((sender_id = current_user_id and receiver_id = target_user_id)
      or (sender_id = target_user_id and receiver_id = current_user_id));
end;
$$;

-- Preserve execution permissions
grant execute on function public.block_member(uuid) to authenticated;
revoke all on function public.block_member(uuid) from public, anon;

-- 2. Replace call_sessions SELECT policy so participants receive terminal Realtime updates
drop policy if exists "Call participants can read their call sessions" on public.call_sessions;

create policy "Call participants can read their call sessions"
  on public.call_sessions
  for select
  to authenticated
  using ((select auth.uid()) in (caller_id, callee_id));

commit;
