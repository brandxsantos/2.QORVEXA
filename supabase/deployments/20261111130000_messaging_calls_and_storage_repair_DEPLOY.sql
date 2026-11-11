-- ============================================================================
-- QORVEXA: MESSAGING, DELIVERY RECEIPTS, STORAGE & CALLING REPAIR PATCH
-- Safe, idempotent deployment patch for conversations, attachments, and calls
-- Run in Supabase SQL Editor to guarantee all columns, RPCs, and buckets exist
-- ============================================================================

begin;

-- 1. Ensure delivery watermark columns exist on public.conversations
alter table public.conversations
  add column if not exists user_low_last_delivered_at timestamptz not null default now(),
  add column if not exists user_high_last_delivered_at timestamptz not null default now();

create index if not exists conversations_user_low_delivered_idx
  on public.conversations (user_low, user_low_last_delivered_at);

create index if not exists conversations_user_high_delivered_idx
  on public.conversations (user_high, user_high_last_delivered_at);

-- Grant select on conversations to authenticated
grant select on public.conversations to authenticated;

-- 2. Ensure private storage bucket 'qorvexa-attachments' exists
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qorvexa-attachments',
  'qorvexa-attachments',
  false,
  52428800, -- 50 MB
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed',
    'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 52428800;

-- Storage RLS policies for qorvexa-attachments
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload attachments to their conversations'
  ) then
    create policy "Authenticated users can upload attachments to their conversations"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'qorvexa-attachments'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Conversation members can view conversation attachments'
  ) then
    create policy "Conversation members can view conversation attachments"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'qorvexa-attachments'
        and exists (
          select 1 from public.conversations c
          where c.id::text = (storage.foldername(name))[1]
            and (select auth.uid()) in (c.user_low, c.user_high)
        )
      );
  end if;
end $$;

-- 3. Idempotent mark_conversation_delivered RPC
create or replace function public.mark_conversation_delivered(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_conversation_id is null or auth.uid() is null then
    return;
  end if;

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
end;
$$;

-- 4. Idempotent mark_conversations_delivered RPC (batch)
create or replace function public.mark_conversations_delivered(target_conversation_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_conversation_ids is null or array_length(target_conversation_ids, 1) is null or auth.uid() is null then
    return;
  end if;

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

-- 5. Updated mark_conversation_read RPC (advances read and delivered together safely)
create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_conversation_id is null or auth.uid() is null then
    return;
  end if;

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
end;
$$;

-- 6. Ensure permissions for authenticated role
grant execute on function public.mark_conversation_delivered(uuid) to authenticated;
grant execute on function public.mark_conversations_delivered(uuid[]) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.start_call(uuid, text) to authenticated;
grant execute on function public.respond_to_call(uuid, text) to authenticated;

-- 7. Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';

commit;
