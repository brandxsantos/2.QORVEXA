-- ============================================================================
-- QORVEXA: FIX ATTACHMENT STORAGE PERMISSIONS & STORAGE.OBJECTS RLS
-- Resolves "permission denied for function can_access_attachment_storage"
-- and restores avatar/media download on storage.objects for authenticated users.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Create Helper Function in public schema
-- ----------------------------------------------------------------------------
create or replace function public.can_access_attachment_storage(object_path text, user_id uuid default auth.uid())
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
      and coalesce(user_id, auth.uid()) in (c.user_low, c.user_high)
      and public.can_view_member(case when c.user_low = coalesce(user_id, auth.uid()) then c.user_high else c.user_low end)
      and exists (
        select 1 from public.friendships f
        where f.user_low = c.user_low and f.user_high = c.user_high
      )
  );
$$;

-- Grant EXECUTE to authenticated role, revoke from public and anon
revoke all on function public.can_access_attachment_storage(text, uuid) from public, anon;
grant execute on function public.can_access_attachment_storage(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Backward Compatibility for qorvexa_private schema
-- ----------------------------------------------------------------------------
create or replace function qorvexa_private.can_access_attachment_storage(object_path text, user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_attachment_storage(object_path, user_id);
$$;

revoke all on function qorvexa_private.can_access_attachment_storage(text, uuid) from public, anon;
grant usage on schema qorvexa_private to authenticated;
grant execute on function qorvexa_private.can_access_attachment_storage(text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Update storage.objects Policies to use public.can_access_attachment_storage
-- ----------------------------------------------------------------------------
drop policy if exists "Conversation members can upload attachments" on storage.objects;
create policy "Conversation members can upload attachments"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qorvexa-attachments'
    and public.can_access_attachment_storage(name, (select auth.uid()))
  );

drop policy if exists "Conversation members can read attachments" on storage.objects;
create policy "Conversation members can read attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'qorvexa-attachments'
    and public.can_access_attachment_storage(name, (select auth.uid()))
  );

drop policy if exists "Senders can delete their own attachments" on storage.objects;
create policy "Senders can delete their own attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'qorvexa-attachments'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

commit;
