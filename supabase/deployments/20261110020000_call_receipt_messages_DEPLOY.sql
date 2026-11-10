-- QORVEXA deployment patch
-- Implements persistent call receipt messages in conversation timeline.
-- Updates conversation inbox preview and updated_at ordering automatically.
-- Execute through Supabase SQL Editor with user approval.

begin;

-- 1. Extend public.messages with message_type and call_session_id
alter table public.messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'call'));

alter table public.messages
  add column if not exists call_session_id uuid
    references public.call_sessions(id) on delete set null;

-- Ensure each call session produces at most one persistent receipt message
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_call_session_id_unique'
  ) then
    alter table public.messages add constraint messages_call_session_id_unique unique (call_session_id);
  end if;
end;
$$;

grant insert (conversation_id, sender_id, content, reply_to_message_id, message_type, call_session_id)
  on public.messages to authenticated;

-- 2. Trigger function: create persistent call receipt message when a call session ends
create or replace function public.create_call_receipt_on_call_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  call_duration int := null;
  summary_text text;
  is_video boolean := (NEW.call_type = 'video');
begin
  -- Only trigger when transitioning into a terminal call status
  if (TG_OP = 'INSERT' or OLD.status in ('ringing', 'accepted'))
     and NEW.status in ('ended', 'declined', 'cancelled', 'expired') then

    if NEW.status = 'ended' and NEW.accepted_at is not null and NEW.ended_at is not null then
      call_duration := greatest(0, extract(epoch from (NEW.ended_at - NEW.accepted_at))::int);
      if call_duration >= 3600 then
        summary_text := (case when is_video then '📹 Video call · ' else '📞 Voice call · ' end) ||
                        to_char((NEW.ended_at - NEW.accepted_at), 'HH24:MI:SS');
      else
        summary_text := (case when is_video then '📹 Video call · ' else '📞 Voice call · ' end) ||
                        to_char((NEW.ended_at - NEW.accepted_at), 'MI:SS');
      end if;
    elsif NEW.status = 'declined' then
      summary_text := case when is_video then '📹 Declined video call' else '📞 Declined call' end;
    elsif NEW.status = 'cancelled' then
      summary_text := case when is_video then '📹 Cancelled video call' else '📞 Cancelled call' end;
    elsif NEW.status = 'expired' then
      summary_text := case when is_video then '📹 Missed video call' else '📞 Missed call' end;
    else
      summary_text := case when is_video then '📹 Video call' else '📞 Voice call' end;
    end if;

    -- Insert call receipt message.
    -- On conflict on call_session_id, it is safely ignored to guarantee zero duplicates.
    insert into public.messages (
      conversation_id,
      sender_id,
      content,
      message_type,
      call_session_id,
      created_at
    )
    values (
      NEW.conversation_id,
      NEW.caller_id,
      summary_text,
      'call',
      NEW.id,
      coalesce(NEW.ended_at, statement_timestamp())
    )
    on conflict (call_session_id) do nothing;

    -- Also update conversation updated_at to ensure inbox ordering
    update public.conversations
    set updated_at = coalesce(NEW.ended_at, statement_timestamp())
    where id = NEW.conversation_id;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_call_sessions_create_receipt on public.call_sessions;
create trigger trg_call_sessions_create_receipt
  after insert or update on public.call_sessions
  for each row execute function public.create_call_receipt_on_call_end();

commit;
