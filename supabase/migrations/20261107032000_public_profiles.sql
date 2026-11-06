alter table public.profiles
  add column if not exists cover_photo_path text,
  add column if not exists location text not null default '',
  add column if not exists website text not null default '',
  add column if not exists education text not null default '',
  add column if not exists workplace text not null default '',
  add column if not exists profile_visibility text not null default 'public',
  add column if not exists friends_visibility text not null default 'everyone',
  add column if not exists online_status_visibility text not null default 'friends',
  add column if not exists location_visibility text not null default 'public',
  add column if not exists website_visibility text not null default 'public',
  add column if not exists education_visibility text not null default 'public',
  add column if not exists workplace_visibility text not null default 'public';

alter table public.profiles
  add constraint profiles_location_length check (char_length(location) <= 100),
  add constraint profiles_website_length check (char_length(website) <= 200),
  add constraint profiles_website_protocol check (website = '' or website ~* '^https?://'),
  add constraint profiles_education_length check (char_length(education) <= 120),
  add constraint profiles_workplace_length check (char_length(workplace) <= 120),
  add constraint profiles_visibility_check check (profile_visibility in ('public', 'friends', 'private')),
  add constraint profiles_friends_visibility_check check (friends_visibility in ('everyone', 'friends', 'only_me')),
  add constraint profiles_online_visibility_check check (online_status_visibility in ('everyone', 'friends', 'nobody')),
  add constraint profiles_location_visibility_check check (location_visibility in ('public', 'friends', 'only_me')),
  add constraint profiles_website_visibility_check check (website_visibility in ('public', 'friends', 'only_me')),
  add constraint profiles_education_visibility_check check (education_visibility in ('public', 'friends', 'only_me')),
  add constraint profiles_workplace_visibility_check check (workplace_visibility in ('public', 'friends', 'only_me'));

update public.profiles
set avatar_url = regexp_replace(
  avatar_url,
  '^https?://[^/]+/storage/v1/object/public/qorvexa-media/',
  ''
)
where avatar_url ~ '^https?://[^/]+/storage/v1/object/public/qorvexa-media/';

alter table public.posts
  add column if not exists post_visibility text not null default 'public';

alter table public.posts
  add constraint posts_visibility_check check (post_visibility in ('public', 'friends', 'only_me'));

grant insert (post_visibility) on public.posts to authenticated;
grant select (id, author_id, content, media_path, media_type, post_visibility, created_at, is_hidden)
  on public.posts to anon;
grant select (id, post_id, author_id, parent_id, content, created_at, is_hidden)
  on public.comments to anon;
grant select on storage.objects to anon, authenticated;

revoke select on public.profiles from anon, authenticated;
grant select (
  id, username, display_name, bio, avatar_url, cover_photo_path,
  profile_visibility, friends_visibility, online_status_visibility,
  location_visibility, website_visibility, education_visibility,
  workplace_visibility, created_at, updated_at
) on public.profiles to anon, authenticated;

revoke select (location, website, education, workplace) on public.profiles from anon, authenticated;

grant update (
  cover_photo_path, location, website, education, workplace,
  profile_visibility, friends_visibility, online_status_visibility,
  location_visibility, website_visibility, education_visibility, workplace_visibility
) on public.profiles to authenticated;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_user_id
      and not qorvexa_private.are_blocked(auth.uid(), p.id)
      and (
        p.id = auth.uid()
        or p.profile_visibility = 'public'
        or (
          p.profile_visibility = 'friends'
          and auth.uid() is not null
          and qorvexa_private.are_friends(auth.uid(), p.id)
        )
      )
  );
$$;

create or replace function public.can_view_post(target_author_id uuid, target_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_view_profile(target_author_id)
    and (
      target_author_id = auth.uid()
      or target_visibility = 'public'
      or (
        target_visibility = 'friends'
        and auth.uid() is not null
        and qorvexa_private.are_friends(auth.uid(), target_author_id)
      )
    );
$$;

create or replace function public.can_view_profile_friends(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and public.can_view_profile(p.id)
      and (
        p.id = auth.uid()
        or p.friends_visibility = 'everyone'
        or (
          p.friends_visibility = 'friends'
          and auth.uid() is not null
          and qorvexa_private.are_friends(auth.uid(), p.id)
        )
      )
  );
$$;

create or replace function public.can_view_profile_info(target_user_id uuid, info_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_user_id
      and public.can_view_profile(p.id)
      and (
        p.id = auth.uid()
        or info_visibility = 'public'
        or (
          info_visibility = 'friends'
          and auth.uid() is not null
          and qorvexa_private.are_friends(auth.uid(), p.id)
        )
      )
  );
$$;

create or replace function public.get_public_profile(target_username text, public_preview boolean default false)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text,
  cover_photo_path text, location text, website text, education text,
  workplace text, profile_visibility text, friends_visibility text,
  online_status_visibility text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar_url,
    p.cover_photo_path,
    case when (public_preview and p.location_visibility = 'public')
      or (not public_preview and public.can_view_profile_info(p.id, p.location_visibility)) then p.location else '' end,
    case when (public_preview and p.website_visibility = 'public')
      or (not public_preview and public.can_view_profile_info(p.id, p.website_visibility)) then p.website else '' end,
    case when (public_preview and p.education_visibility = 'public')
      or (not public_preview and public.can_view_profile_info(p.id, p.education_visibility)) then p.education else '' end,
    case when (public_preview and p.workplace_visibility = 'public')
      or (not public_preview and public.can_view_profile_info(p.id, p.workplace_visibility)) then p.workplace else '' end,
    p.profile_visibility, p.friends_visibility, p.online_status_visibility, p.created_at
  from public.profiles p
  where lower(p.username) = lower(target_username)
    and public.can_view_profile(p.id)
    and (not public_preview or (p.id = auth.uid() and p.profile_visibility = 'public'))
  limit 1;
$$;

create or replace function public.get_own_profile_settings()
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text,
  cover_photo_path text, location text, website text, education text,
  workplace text, profile_visibility text, friends_visibility text,
  online_status_visibility text, location_visibility text,
  website_visibility text, education_visibility text, workplace_visibility text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.bio, p.avatar_url,
    p.cover_photo_path, p.location, p.website, p.education, p.workplace,
    p.profile_visibility, p.friends_visibility, p.online_status_visibility,
    p.location_visibility, p.website_visibility, p.education_visibility, p.workplace_visibility
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.get_profile_friends(target_user_id uuid)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.friendships f
  join public.profiles p
    on p.id = case when f.user_low = target_user_id then f.user_high else f.user_low end
  where target_user_id in (f.user_low, f.user_high)
    and public.can_view_profile_friends(target_user_id)
    and public.can_view_profile(p.id)
  order by lower(p.display_name), lower(p.username);
$$;

create or replace function public.get_visible_post_like_counts(target_post_ids uuid[])
returns table (post_id uuid, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select likes.post_id, count(*)::bigint
  from public.post_likes likes
  join public.posts p on p.id = likes.post_id
  where likes.post_id = any(coalesce(target_post_ids, array[]::uuid[]))
    and public.can_view_post(p.author_id, p.post_visibility)
    and not p.is_hidden
  group by likes.post_id;
$$;

revoke all on function public.can_view_profile(uuid) from public;
revoke all on function public.can_view_post(uuid, text) from public;
revoke all on function public.can_view_profile_friends(uuid) from public;
revoke all on function public.can_view_profile_info(uuid, text) from public;
revoke all on function public.get_public_profile(text, boolean) from public;
revoke all on function public.get_own_profile_settings() from public, anon;
revoke all on function public.get_profile_friends(uuid) from public, anon, authenticated;
revoke all on function public.get_visible_post_like_counts(uuid[]) from public;
grant execute on function public.can_view_profile(uuid) to anon, authenticated;
grant execute on function public.can_view_post(uuid, text) to anon, authenticated;
grant execute on function public.can_view_profile_friends(uuid) to authenticated;
grant execute on function public.can_view_profile_info(uuid, text) to anon, authenticated;
grant execute on function public.get_public_profile(text, boolean) to anon, authenticated;
grant execute on function public.get_own_profile_settings() to authenticated;
grant execute on function public.get_profile_friends(uuid) to anon, authenticated;
grant execute on function public.get_visible_post_like_counts(uuid[]) to anon, authenticated;

drop policy if exists "Profiles are visible unless either member blocked the other" on public.profiles;
create policy "Profiles are visible according to owner privacy settings"
  on public.profiles for select to anon, authenticated
  using (public.can_view_profile(id));

drop policy if exists "Members can read their own likes and visible post likes" on public.post_likes;
create policy "Members can read only their own likes"
  on public.post_likes for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Signed-in members can read visible posts" on public.posts;
create policy "Posts are visible according to profile and post privacy"
  on public.posts for select to authenticated
  using (
    public.can_view_post(author_id, post_visibility)
    and (not is_hidden or (select public.is_current_content_moderator()))
  );

create policy "Anonymous visitors can read public posts"
  on public.posts for select to anon
  using (public.can_view_post(author_id, post_visibility) and not is_hidden);

drop policy if exists "Signed-in members can read visible comments" on public.comments;
create policy "Comments follow their post visibility"
  on public.comments for select to authenticated
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and public.can_view_post(p.author_id, p.post_visibility)
        and (not p.is_hidden or (select public.is_current_content_moderator()))
    )
    and (not is_hidden or (select public.is_current_content_moderator()))
    and public.can_view_member(author_id)
  );

create policy "Anonymous visitors can read comments on public posts"
  on public.comments for select to anon
  using (
    exists (
      select 1 from public.posts p
      where p.id = comments.post_id
        and public.can_view_post(p.author_id, p.post_visibility)
        and not p.is_hidden
    )
    and not is_hidden
    and public.can_view_member(author_id)
  );

drop policy if exists "Members can comment on visible posts as themselves" on public.comments;
create policy "Members can comment on visible posts as themselves"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and (select public.can_current_user_comment())
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and public.can_view_post(p.author_id, p.post_visibility)
        and (not p.is_hidden or (select public.is_current_content_moderator()))
    )
  );

drop policy if exists "Signed-in users can view QORVEXA presence" on realtime.messages;
create policy "Members can view presence allowed by profile privacy"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
    and exists (
      select 1 from public.profiles p
      where p.id::text = coalesce(
        realtime.messages.payload ->> 'user_id',
        realtime.messages.payload -> 'payload' ->> 'user_id'
      )
        and public.can_view_profile(p.id)
        and (
          p.id = (select auth.uid())
          or p.online_status_visibility = 'everyone'
          or (
            p.online_status_visibility = 'friends'
            and exists (
              select 1 from public.friendships f
              where (f.user_low = p.id and f.user_high = (select auth.uid()))
                 or (f.user_high = p.id and f.user_low = (select auth.uid()))
            )
          )
        )
    )
  );

drop policy if exists "Signed-in users can publish QORVEXA presence" on realtime.messages;
create policy "Members can publish only their own QORVEXA presence"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() = 'qorvexa-online-presence'
    and realtime.messages.extension = 'presence'
    and coalesce(
      realtime.messages.payload ->> 'user_id',
      realtime.messages.payload -> 'payload' ->> 'user_id'
    ) = (select auth.uid())::text
  );

update storage.buckets
set public = false
where id = 'qorvexa-media';

drop policy if exists "Public can view QORVEXA media" on storage.objects;
drop policy if exists "Members can view authorized QORVEXA media" on storage.objects;
create policy "Members can view authorized QORVEXA media"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'qorvexa-media'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and (
          (
            (storage.foldername(name))[2] in ('avatars', 'covers')
            and public.can_view_profile(p.id)
          )
          or (
            (storage.foldername(name))[2] = 'posts'
            and exists (
              select 1 from public.posts post
              where post.author_id = p.id
                and post.media_path = storage.objects.name
                and public.can_view_post(post.author_id, post.post_visibility)
                and not post.is_hidden
            )
          )
        )
    )
  );
