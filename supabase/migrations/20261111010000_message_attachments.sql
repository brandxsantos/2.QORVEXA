-- ============================================================================
-- QORVEXA MESSAGING — PHASE 1: MESSAGE ATTACHMENTS & SHARED MEDIA
-- Photo Sharing, Video Sharing, File Attachments, and Shared Media Gallery
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Storage Bucket: qorvexa-attachments (Strictly Private)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'qorvexa-attachments',
  'qorvexa-attachments',
  false,
  52428800, -- 50 MB
  array[
    -- Images
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    -- Videos
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
    -- Documents & Audio
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
    file_size_limit = 52428800,
    allowed_mime_types = array[
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
    ];

-- ----------------------------------------------------------------------------
-- 2. Relax messages.content constraint to allow captionless media
-- ----------------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_content_length;

-- Allow content to be optional / empty when accompanied by attachments
alter table public.messages alter column content drop not null;

alter table public.messages add constraint messages_content_length check (
  content is null or char_length(content) <= 4000
);

-- ----------------------------------------------------------------------------
-- 3. Table: public.message_attachments
-- ----------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  attachment_type text not null check (attachment_type in ('photo', 'video', 'file')),
  thumbnail_path text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint message_attachments_storage_path_unique unique (storage_path)
);

-- Indexes for lightning-fast retrieval in chat timelines & shared media gallery
create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);

create index if not exists message_attachments_conversation_type_idx
  on public.message_attachments (conversation_id, attachment_type, created_at desc);

create index if not exists message_attachments_sender_idx
  on public.message_attachments (sender_id);

-- ----------------------------------------------------------------------------
-- 4. RLS & Permissions for public.message_attachments
-- ----------------------------------------------------------------------------
alter table public.message_attachments enable row level security;

revoke all on public.message_attachments from public, anon, authenticated;

grant select, delete on public.message_attachments to authenticated;
grant insert (
  message_id, conversation_id, sender_id, storage_path,
  original_filename, mime_type, file_size, attachment_type,
  thumbnail_path, metadata
) on public.message_attachments to authenticated;

drop policy if exists "Conversation members can read message attachments" on public.message_attachments;
create policy "Conversation members can read message attachments"
  on public.message_attachments for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

drop policy if exists "Members can insert attachments for their own messages" on public.message_attachments;
create policy "Members can insert attachments for their own messages"
  on public.message_attachments for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.can_current_user_message())
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = (select auth.uid())
        and m.conversation_id = message_attachments.conversation_id
    )
  );

drop policy if exists "Senders can delete their own attachments" on public.message_attachments;
create policy "Senders can delete their own attachments"
  on public.message_attachments for delete to authenticated
  using (
    sender_id = (select auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 5. Helper Function & Storage RLS for qorvexa-attachments Bucket
-- ----------------------------------------------------------------------------
create or replace function qorvexa_private.can_access_attachment_storage(object_path text, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id::text = (storage.foldername(object_path))[1]
      and user_id in (c.user_low, c.user_high)
      and public.can_view_member(case when c.user_low = user_id then c.user_high else c.user_low end)
      and exists (
        select 1 from public.friendships f
        where f.user_low = c.user_low and f.user_high = c.user_high
      )
  );
$$;

revoke all on function qorvexa_private.can_access_attachment_storage(text, uuid) from public, anon, authenticated;

-- Storage Insert Policy: Senders can upload into their conversation folder
drop policy if exists "Conversation members can upload attachments" on storage.objects;
create policy "Conversation members can upload attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qorvexa-attachments'
    and qorvexa_private.can_access_attachment_storage(name, (select auth.uid()))
  );

-- Storage Select Policy: Conversation members can read attachments
drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Conversation members can read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qorvexa-attachments'
    and qorvexa_private.can_access_attachment_storage(name, (select auth.uid()))
  );

-- Storage Delete Policy: Senders can remove their own attachments
drop policy if exists "Senders can delete their own attachments" on storage.objects;
create policy "Senders can delete their own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'qorvexa-attachments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

-- ----------------------------------------------------------------------------
-- 6. Update get_conversation_summaries to format media previews
-- ----------------------------------------------------------------------------
create or replace function public.get_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_message_content text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
    latest.id,
    case
      when latest.content is not null and btrim(latest.content) <> '' then latest.content
      when latest_att.attachment_type = 'photo' then '📷 Photo'
      when latest_att.attachment_type = 'video' then '🎥 Video'
      when latest_att.attachment_type = 'file' then '📎 ' || coalesce(latest_att.original_filename, 'File')
      else ''
    end,
    latest.sender_id,
    latest.created_at,
    count(unread.id)::bigint
  from public.conversations c
  left join lateral (
    select m.id, m.content, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select a.attachment_type, a.original_filename
    from public.message_attachments a
    where a.message_id = latest.id
    order by a.created_at asc
    limit 1
  ) latest_att on true
  left join public.messages unread
    on unread.conversation_id = c.id
    and unread.sender_id <> auth.uid()
    and unread.created_at > case
      when c.user_low = auth.uid() then c.user_low_last_read_at
      else c.user_high_last_read_at
    end
  where auth.uid() in (c.user_low, c.user_high)
    and public.can_view_member(case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end)
    and exists (
      select 1 from public.friendships f
      where f.user_low = c.user_low and f.user_high = c.user_high
    )
  group by c.id, latest.id, latest.content, latest.sender_id, latest.created_at, latest_att.attachment_type, latest_att.original_filename;
$$;

-- ----------------------------------------------------------------------------
-- 7. Add public.message_attachments to Supabase Realtime publication
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_attachments'
  ) then
    alter publication supabase_realtime
      add table public.message_attachments;
  end if;
end;
$$;

commit;
