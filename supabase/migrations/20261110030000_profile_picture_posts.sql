-- Allow members to publish timeline posts for profile picture updates
drop policy if exists "Members can publish posts as themselves" on public.posts;
create policy "Members can publish posts as themselves"
  on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select public.can_current_user_post())
    and (
      media_path is null
      or (
        media_type = 'image'
        and (
          media_path like (select auth.uid())::text || '/posts/%'
          or media_path like (select auth.uid())::text || '/avatars/%'
        )
      )
    )
  );
