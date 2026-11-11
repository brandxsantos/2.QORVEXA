-- ============================================================================
-- QORVEXA: RESTORE CALL RECEIPT TRIGGER ON CALL SESSIONS
-- Deployment companion file: 20261112030000_restore_call_receipt_trigger_DEPLOY.sql
-- Restores live deployment gap for public.create_call_receipt_on_call_end
-- and trg_call_sessions_create_receipt from 20261110020000_call_receipt_messages.
-- Safe, idempotent, transactional deployment patch.
-- ============================================================================

begin;

-- 1. Ensure unique constraint exists on public.messages(call_session_id)
--    checking both constraint name and table relation oid.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'messages_call_session_id_unique'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_call_session_id_unique unique (call_session_id);
  end if;
end;
$$;

-- 2. Restore exact trigger function from 20261110020000_call_receipt_messages.sql
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

-- 3. Revoke direct execute from untrusted roles (trigger functions only execute via trigger)
revoke all on function public.create_call_receipt_on_call_end() from public, anon;

-- 4. Recreate trigger on public.call_sessions
drop trigger if exists trg_call_sessions_create_receipt on public.call_sessions;
create trigger trg_call_sessions_create_receipt
  after insert or update on public.call_sessions
  for each row execute function public.create_call_receipt_on_call_end();

-- 5. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

commit;
