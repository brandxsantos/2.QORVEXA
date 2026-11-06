drop policy if exists "Conversation friends can receive typing broadcasts" on realtime.messages;
create policy "Conversation friends can receive typing broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.conversations c
      join public.friendships f
        on f.user_low = c.user_low and f.user_high = c.user_high
      where realtime.topic() = 'conversation-' || c.id::text
        and (select auth.uid()) in (c.user_low, c.user_high)
    )
  );

drop policy if exists "Conversation friends can send typing broadcasts" on realtime.messages;
create policy "Conversation friends can send typing broadcasts"
  on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.conversations c
      join public.friendships f
        on f.user_low = c.user_low and f.user_high = c.user_high
      where realtime.topic() = 'conversation-' || c.id::text
        and (select auth.uid()) in (c.user_low, c.user_high)
    )
  );

drop policy if exists "Signed-in users can view QORVEXA presence" on realtime.messages;
create policy "Signed-in users can view QORVEXA presence"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
  );

drop policy if exists "Users can publish their own QORVEXA presence" on realtime.messages;
drop policy if exists "Signed-in users can publish QORVEXA presence" on realtime.messages;
create policy "Signed-in users can publish QORVEXA presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
  );
