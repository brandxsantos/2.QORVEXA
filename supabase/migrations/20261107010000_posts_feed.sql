create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint posts_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint posts_content_length check (
    char_length(btrim(content)) between 1 and 1000
  )
);

create index posts_created_at_idx
  on public.posts (created_at desc);

create index posts_author_id_created_at_idx
  on public.posts (author_id, created_at desc);

alter table public.posts enable row level security;
revoke all on public.posts from public, anon, authenticated;
grant select on public.posts to authenticated;
grant insert (author_id, content) on public.posts to authenticated;

create policy "Signed-in members can read posts"
  on public.posts
  for select
  to authenticated
  using (true);

create policy "Members can publish posts as themselves"
  on public.posts
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);
