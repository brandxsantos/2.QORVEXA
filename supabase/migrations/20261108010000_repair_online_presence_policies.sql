create or replace function public.can_view_online_status(target_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_member_id
      and public.can_view_profile(p.id)
      and (
        p.id = auth.uid()
        or p.online_status_visibility = 'everyone'
        or (
          p.online_status_visibility = 'friends'
          and auth.uid() is not null
          and qorvexa_private.are_friends(auth.uid(), p.id)
        )
      )
  );
$$;

revoke all on function public.can_view_online_status(uuid) from public;
grant execute on function public.can_view_online_status(uuid) to authenticated;

drop policy if exists "Signed-in users can view QORVEXA presence" on realtime.messages;
drop policy if exists "Members can view presence allowed by profile privacy" on realtime.messages;
drop policy if exists "Members can view authorized per-member presence" on realtime.messages;
drop policy if exists "Signed-in users can publish QORVEXA presence" on realtime.messages;
drop policy if exists "Users can publish their own QORVEXA presence" on realtime.messages;
drop policy if exists "Members can publish only their own QORVEXA presence" on realtime.messages;
drop policy if exists "Members can publish only their own per-member presence" on realtime.messages;

create policy "Members can view authorized per-member presence"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'presence'
    and case
      when realtime.topic() ~ '^qorvexa-online-presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        then public.can_view_online_status(
          substring(realtime.topic() from char_length('qorvexa-online-presence:') + 1)::uuid
        )
      else false
    end
  );

create policy "Members can publish only their own per-member presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'presence'
    and realtime.topic() = 'qorvexa-online-presence:' || (select auth.uid())::text
  );
