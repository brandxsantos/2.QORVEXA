create table public.post_reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null
    constraint post_reposts_post_id_fkey
    references public.posts(id) on delete cascade,
  user_id uuid not null
    constraint post_reposts_user_id_fkey
    references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint post_reposts_unique_user_post unique (user_id, post_id)
);

create index post_reposts_user_created_idx
  on public.post_reposts (user_id, created_at desc);

create index post_reposts_post_created_idx
  on public.post_reposts (post_id, created_at desc);

alter table public.post_reposts enable row level security;

revoke all on public.post_reposts from public, anon, authenticated;
grant select, insert, delete on public.post_reposts to authenticated;

create policy "Members can read their own or visible reposts"
  on public.post_reposts for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.posts p
      where p.id = post_reposts.post_id
        and public.can_view_post(p.author_id, p.post_visibility)
        and not p.is_hidden
        and public.can_view_member(p.author_id)
        and public.can_view_member(post_reposts.user_id)
    )
  );

create policy "Members can repost visible posts as themselves"
  on public.post_reposts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_current_user_post()
    and exists (
      select 1
      from public.posts p
      where p.id = post_reposts.post_id
        and p.author_id <> (select auth.uid())
        and public.can_view_post(p.author_id, p.post_visibility)
        and not p.is_hidden
        and public.can_view_member(p.author_id)
    )
  );

create policy "Members can remove their own reposts"
  on public.post_reposts for delete to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_reposts'
  ) then
    alter publication supabase_realtime add table public.post_reposts;
  end if;
end;
$$;
