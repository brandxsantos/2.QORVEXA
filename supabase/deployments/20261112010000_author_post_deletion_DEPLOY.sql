-- ============================================================================
-- QORVEXA DEPLOYMENT SCRIPT: Phase 2, Stage 2A — Author Post Deletion
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- 1. Grant DELETE permission on public.posts to authenticated role
grant delete on public.posts to authenticated;

-- 2. Create row level security policy allowing authors to delete only their own posts
drop policy if exists "Members can delete their own posts" on public.posts;
create policy "Members can delete their own posts"
  on public.posts for delete to authenticated
  using (
    author_id = (select auth.uid())
  );
