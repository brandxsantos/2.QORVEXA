begin;

create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  caller_id uuid not null references auth.users(id) on delete cascade,
  callee_id uuid not null references auth.users(id) on delete cascade,
  call_type text not null check (call_type in ('audio', 'video')),
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'cancelled', 'ended', 'expired')),
  created_at timestamptz not null default statement_timestamp(),
  accepted_at timestamptz,
  ended_at timestamptz,
  constraint call_sessions_distinct_members check (caller_id <> callee_id)
);

create index call_sessions_caller_created_idx
  on public.call_sessions (caller_id, created_at desc);

create index call_sessions_callee_created_idx
  on public.call_sessions (callee_id, created_at desc);

create unique index call_sessions_one_active_per_conversation
  on public.call_sessions (conversation_id)
  where status in ('ringing', 'accepted');

alter table public.call_sessions enable row level security;

create policy "Call participants can read their call sessions"
  on public.call_sessions
  for select
  to authenticated
  using (
    (select auth.uid()) in (call_sessions.caller_id, call_sessions.callee_id)
    and exists (
      select 1
      from public.conversations c
      where c.id = call_sessions.conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and call_sessions.caller_id in (c.user_low, c.user_high)
        and call_sessions.callee_id in (c.user_low, c.user_high)
        and public.can_view_member(
          case
            when c.user_low = (select auth.uid()) then c.user_high
            else c.user_low
          end
        )
        and exists (
          select 1
          from public.friendships f
          where f.user_low = c.user_low
            and f.user_high = c.user_high
        )
    )
  );

revoke all on public.call_sessions from public, anon, authenticated;
grant select on public.call_sessions to authenticated;

create or replace function public.start_call(
  target_conversation_id uuid,
  target_call_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  other_user_id uuid;
  new_call_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in to start a call.';
  end if;

  if target_call_type not in ('audio', 'video') then
    raise exception 'Unsupported call type.';
  end if;

  if not public.can_current_user_message() then
    raise exception 'Your account cannot start calls at this time.';
  end if;

  select case
    when c.user_low = current_user_id then c.user_high
    else c.user_low
  end
  into other_user_id
  from public.conversations c
  where c.id = target_conversation_id
    and current_user_id in (c.user_low, c.user_high);

  if other_user_id is null then
    raise exception 'Conversation not found or access denied.';
  end if;

  if qorvexa_private.are_blocked(current_user_id, other_user_id)
     or not qorvexa_private.are_friends(current_user_id, other_user_id) then
    raise exception 'Calls are available only between unblocked accepted friends.';
  end if;

  update public.call_sessions
  set status = 'expired',
      ended_at = statement_timestamp()
  where conversation_id = target_conversation_id
    and status = 'ringing'
    and created_at < statement_timestamp() - interval '60 seconds';

  insert into public.call_sessions (
    conversation_id, caller_id, callee_id, call_type
  )
  values (
    target_conversation_id, current_user_id, other_user_id, target_call_type
  )
  returning id into new_call_id;

  return new_call_id;
end;
$$;

create or replace function public.respond_to_call(
  target_call_id uuid,
  target_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  call_row public.call_sessions%rowtype;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if target_action not in ('accept', 'decline', 'cancel', 'end') then
    raise exception 'Unsupported call action.';
  end if;

  select *
  into call_row
  from public.call_sessions
  where id = target_call_id
  for update;

  if not found then
    raise exception 'Call not found.';
  end if;

  if current_user_id not in (call_row.caller_id, call_row.callee_id) then
    raise exception 'You are not a participant in this call.';
  end if;

  if qorvexa_private.are_blocked(call_row.caller_id, call_row.callee_id)
     or not qorvexa_private.are_friends(call_row.caller_id, call_row.callee_id) then
    raise exception 'This call is no longer available.';
  end if;

  if target_action = 'accept' then
    if current_user_id <> call_row.callee_id or call_row.status <> 'ringing' then
      raise exception 'This call cannot be accepted.';
    end if;

    if call_row.created_at < statement_timestamp() - interval '60 seconds' then
      update public.call_sessions
      set status = 'expired',
          ended_at = statement_timestamp()
      where id = target_call_id;
      return;
    end if;

    update public.call_sessions
    set status = 'accepted',
        accepted_at = statement_timestamp()
    where id = target_call_id;

  elsif target_action = 'decline' then
    if current_user_id <> call_row.callee_id or call_row.status <> 'ringing' then
      raise exception 'This call cannot be declined.';
    end if;

    update public.call_sessions
    set status = 'declined',
        ended_at = statement_timestamp()
    where id = target_call_id;

  elsif target_action = 'cancel' then
    if current_user_id <> call_row.caller_id or call_row.status <> 'ringing' then
      raise exception 'This call cannot be cancelled.';
    end if;

    update public.call_sessions
    set status = 'cancelled',
        ended_at = statement_timestamp()
    where id = target_call_id;

  elsif target_action = 'end' then
    if call_row.status <> 'accepted' then
      raise exception 'This call is not active.';
    end if;

    update public.call_sessions
    set status = 'ended',
        ended_at = statement_timestamp()
    where id = target_call_id;
  end if;
end;
$$;

revoke all on function public.start_call(uuid, text) from public, anon;
revoke all on function public.respond_to_call(uuid, text) from public, anon;

grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.respond_to_call(uuid, text) to authenticated;

drop policy if exists "Call participants can receive private call signaling" on realtime.messages;
create policy "Call participants can receive private call signaling"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then exists (
        select 1
        from public.call_sessions s
        where s.id = substring(realtime.topic() from 6)::uuid
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
  );


drop policy if exists "Call participants can send private call signaling" on realtime.messages;
create policy "Call participants can send private call signaling"
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and case
      when realtime.topic() ~ '^call:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then exists (
        select 1
        from public.call_sessions s
        where s.id = substring(realtime.topic() from 6)::uuid
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
  );


do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_sessions'
  ) then
    alter publication supabase_realtime add table public.call_sessions;
  end if;
end;
$$;

commit;
