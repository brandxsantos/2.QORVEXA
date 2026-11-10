begin;

-- Fix channel authorization: compare call IDs as text.
-- This prevents non-call topics from causing invalid UUID casts.

-- Shared predicate: is the current user authorized for this call topic?
create or replace function public.can_access_call_topic()
returns boolean
language sql
stable
security definer
set search_path = public, realtime
as $$
  select
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~
        '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then exists (
        select 1
        from public.call_sessions s
        where s.id::text = substring(realtime.topic() from 6)
          and (select auth.uid()) in (s.caller_id, s.callee_id)
          and public.can_view_member(
            case
              when s.caller_id = (select auth.uid()) then s.callee_id
              else s.caller_id
            end
          )
          and exists (
            select 1
            from public.conversations c
            join public.friendships f
              on f.user_low = c.user_low
             and f.user_high = c.user_high
            where c.id = s.conversation_id
              and c.user_low = least(s.caller_id, s.callee_id)
              and c.user_high = greatest(s.caller_id, s.callee_id)
          )
          and s.status = 'accepted'
      )
      else false
    end
$$;

drop policy if exists "Call participants can receive private call signaling"
on realtime.messages;

create policy "Call participants can receive private call signaling"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_access_call_topic()
);

drop policy if exists "Call participants can send private call signaling"
on realtime.messages;

create policy "Call participants can send private call signaling"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and public.can_access_call_topic()
);

commit;
