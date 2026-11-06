create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null,
  author_id uuid not null,
  parent_id uuid,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comments_post_id_fkey
    foreign key (post_id) references public.posts (id) on delete cascade,
  constraint comments_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade,
  constraint comments_parent_same_post_fkey
    foreign key (parent_id, post_id) references public.comments (id, post_id) on delete cascade,
  constraint comments_id_post_id_unique unique (id, post_id),
  constraint comments_content_length check (
    char_length(btrim(content)) between 1 and 1000
  )
);

create index comments_post_id_created_at_idx
  on public.comments (post_id, created_at desc);

create index comments_author_id_created_at_idx
  on public.comments (author_id, created_at desc);

create index comments_parent_id_idx
  on public.comments (parent_id);

create function public.ensure_comment_reply_is_one_level()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_comment_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id into parent_comment_id
  from public.comments
  where id = new.parent_id
    and post_id = new.post_id;

  if parent_comment_id is not null then
    raise exception 'Replies can only be made to top-level comments.';
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_comment_reply_is_one_level() from public, anon, authenticated;

create trigger comments_one_level_replies
  before insert on public.comments
  for each row execute function public.ensure_comment_reply_is_one_level();

alter table public.comments enable row level security;
revoke all on public.comments from public, anon, authenticated;
grant select, delete on public.comments to authenticated;
grant insert (post_id, author_id, parent_id, content) on public.comments to authenticated;

create policy "Signed-in members can read comments"
  on public.comments
  for select
  to authenticated
  using (true);

create policy "Members can comment as themselves"
  on public.comments
  for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

create policy "Members can delete their own comments"
  on public.comments
  for delete
  to authenticated
  using ((select auth.uid()) = author_id);
