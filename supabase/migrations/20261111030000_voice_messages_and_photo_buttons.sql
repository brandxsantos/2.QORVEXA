-- ============================================================================
-- QORVEXA MESSAGING — VOICE MESSAGES & SEPARATE ACTION BUTTONS
-- Adds support for 'audio' attachment_type and voice message previews
-- ============================================================================

begin;

-- 1. Extend attachment_type constraint to include 'audio', 'image', and 'document'
alter table public.message_attachments drop constraint if exists message_attachments_attachment_type_check;

alter table public.message_attachments add constraint message_attachments_attachment_type_check
  check (attachment_type in ('photo', 'image', 'video', 'file', 'audio', 'document'));

-- 2. Update storage bucket allowed mime types for audio formats
update storage.buckets
set allowed_mime_types = array[
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
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm',
  'audio/x-m4a', 'audio/aac', 'audio/webm;codecs=opus'
]
where id = 'qorvexa-attachments';

-- 3. Update get_conversation_summaries to format '🎙️ Voice message'
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
      when latest_att.attachment_type in ('photo', 'image') then '📷 Photo'
      when latest_att.attachment_type = 'video' then '🎥 Video'
      when latest_att.attachment_type = 'audio' then '🎙️ Voice message'
      when latest_att.attachment_type in ('file', 'document') then '📎 ' || coalesce(latest_att.original_filename, 'File')
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

commit;
