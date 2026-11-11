-- Phase 2, Stage 2A: Author Post Deletion
-- Grant DELETE on public.posts to authenticated users and enforce author-only deletion via RLS

grant delete on public.posts to authenticated;

drop policy if exists "Members can delete their own posts" on public.posts;
create policy "Members can delete their own posts"
  on public.posts for delete to authenticated
  using (
    author_id = (select auth.uid())
  );
