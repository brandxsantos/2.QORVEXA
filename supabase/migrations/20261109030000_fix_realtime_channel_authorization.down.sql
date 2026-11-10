begin;

drop policy if exists "Call participants can receive private call signaling"
on realtime.messages;

drop policy if exists "Call participants can send private call signaling"
on realtime.messages;

-- Revert the helper function introduced by the up migration.
drop function if exists public.can_access_call_topic();

commit;
