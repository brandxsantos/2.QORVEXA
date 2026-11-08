alter table public.post_likes
  add column if not exists reaction_type text not null default 'like';

alter table public.post_likes
  drop constraint if exists post_likes_reaction_type_check;

alter table public.post_likes
  add constraint post_likes_reaction_type_check
  check (reaction_type in (
    'like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'
  ));

revoke insert on public.post_likes from authenticated;
revoke update on public.post_likes from authenticated;

grant insert (post_id, user_id, reaction_type)
  on public.post_likes to authenticated;

grant update (reaction_type)
  on public.post_likes to authenticated;

drop policy if exists "Members can change their own reactions"
  on public.post_likes;

create policy "Members can change their own reactions"
  on public.post_likes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and not p.is_hidden
        and public.can_view_member(p.author_id)
    )
  );
