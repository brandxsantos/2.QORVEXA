-- QORVEXA Advanced Admin Analytics
-- Generated from the reviewed local migration.
-- Execute through Supabase SQL Editor.
-- Transaction ensures all-or-nothing execution.

BEGIN;

-- QORVEXA: Advanced administrator analytics
-- Historical activity and follow events begin at installation time.
-- All analytics are returned through an administrator-only RPC.

-- =========================================================
-- 1. DAILY MEMBER ACTIVITY
-- =========================================================

create table public.member_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  last_seen_at timestamptz not null default statement_timestamp(),
  primary key (user_id, activity_date)
);

create index member_daily_activity_date_idx
  on public.member_daily_activity (activity_date desc);

create index member_daily_activity_last_seen_idx
  on public.member_daily_activity (last_seen_at desc);

alter table public.member_daily_activity enable row level security;

revoke all on public.member_daily_activity
  from public, anon, authenticated;

-- Preserve the existing heartbeat while recording one row per UTC day.
create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  today_utc date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if current_user_id is null then
    return;
  end if;

  update public.profiles
  set last_active_at = statement_timestamp()
  where id = current_user_id;

  insert into public.member_daily_activity (
    user_id,
    activity_date,
    last_seen_at
  )
  values (
    current_user_id,
    today_utc,
    statement_timestamp()
  )
  on conflict (user_id, activity_date)
  do update set last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;


-- =========================================================
-- 2. FOLLOW / UNFOLLOW HISTORY
-- =========================================================

create table public.member_follow_events (
  id bigint generated always as identity primary key,
  follower_id uuid references auth.users(id) on delete set null,
  following_id uuid references auth.users(id) on delete set null,
  action_type text not null check (
    action_type in ('follow', 'unfollow')
  ),
  occurred_at timestamptz not null default statement_timestamp()
);

create index member_follow_events_occurred_idx
  on public.member_follow_events (occurred_at desc);

create index member_follow_events_action_occurred_idx
  on public.member_follow_events (action_type, occurred_at desc);

alter table public.member_follow_events enable row level security;

revoke all on public.member_follow_events
  from public, anon, authenticated;

create function qorvexa_private.record_follow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.member_follow_events (
      follower_id,
      following_id,
      action_type
    )
    values (
      new.follower_id,
      new.following_id,
      'follow'
    );

    return new;
  elsif tg_op = 'DELETE' then
    -- Skip nested deletes caused by profile/account FK cascades.
    -- Direct follow removals still execute at trigger depth 1.
    if pg_trigger_depth() > 1 then
      return old;
    end if;
    insert into public.member_follow_events (
      follower_id,
      following_id,
      action_type
    )
    values (
      old.follower_id,
      old.following_id,
      'unfollow'
    );

    return old;
  end if;

  return null;
end;
$$;

alter function qorvexa_private.record_follow_event()
  owner to postgres;

revoke all on function qorvexa_private.record_follow_event()
  from public, anon, authenticated;

create trigger user_follows_record_analytics
  after insert or delete on public.user_follows
  for each row
  execute function qorvexa_private.record_follow_event();


-- =========================================================
-- 3. ADMIN ANALYTICS RPC
-- =========================================================

create or replace function public.admin_get_advanced_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today_utc date := (statement_timestamp() at time zone 'UTC')::date;
  active_24h bigint;
  daily_activity jsonb;
  follower_growth jsonb;
  top_posts jsonb;
  report_metrics jsonb;
  moderation_trend jsonb;
begin
  if not qorvexa_private.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  -- Current rolling 24-hour activity from actual presence heartbeats.
  select count(distinct user_id)
  into active_24h
  from public.member_daily_activity
  where last_seen_at >= statement_timestamp() - interval '24 hours';

  -- Historical daily active members (UTC).
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', days.day::date,
        'count', coalesce(activity.member_count, 0)
      )
      order by days.day::date
    ),
    '[]'::jsonb
  )
  into daily_activity
  from generate_series(
    today_utc - 6,
    today_utc,
    interval '1 day'
  ) as days(day)
  left join lateral (
    select count(distinct a.user_id) as member_count
    from public.member_daily_activity a
    where a.activity_date = days.day::date
  ) activity on true;

  -- Follow and unfollow events per UTC day.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', days.day::date,
        'follows', coalesce(events.follow_count, 0),
        'unfollows', coalesce(events.unfollow_count, 0),
        'net_growth',
          coalesce(events.follow_count, 0)
          - coalesce(events.unfollow_count, 0)
      )
      order by days.day::date
    ),
    '[]'::jsonb
  )
  into follower_growth
  from generate_series(
    today_utc - 6,
    today_utc,
    interval '1 day'
  ) as days(day)
  left join lateral (
    select
      count(*) filter (where e.action_type = 'follow') as follow_count,
      count(*) filter (where e.action_type = 'unfollow') as unfollow_count
    from public.member_follow_events e
    where e.occurred_at >= (days.day::date::timestamp at time zone 'UTC')
      and e.occurred_at < ((days.day::date + 1)::timestamp at time zone 'UTC')
  ) events on true;

  -- Top five non-hidden posts, including every visibility setting.
  -- Return metadata and engagement counts only; never return post content.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', ranked.id,
        'created_at', ranked.created_at,
        'visibility', ranked.post_visibility,
        'reaction_count', ranked.reaction_count,
        'comment_count', ranked.comment_count,
        'engagement', ranked.engagement
      )
      order by ranked.engagement desc, ranked.created_at desc
    ),
    '[]'::jsonb
  )
  into top_posts
  from (
    select
      p.id,
      p.created_at,
      p.post_visibility,
      reactions.reaction_count,
      comments.comment_count,
      reactions.reaction_count + comments.comment_count as engagement
    from public.posts p
    left join lateral (
      select count(*) as reaction_count
      from public.post_likes l
      where l.post_id = p.id
    ) reactions on true
    left join lateral (
      select count(*) as comment_count
      from public.comments c
      where c.post_id = p.id
        and not c.is_hidden
    ) comments on true
    where not p.is_hidden
    order by engagement desc, p.created_at desc
    limit 5
  ) ranked;

  -- Report queue and resolution statistics.
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'in_review', count(*) filter (where status = 'in_review'),
    'resolved', count(*) filter (where status = 'resolved'),
    'dismissed', count(*) filter (where status = 'dismissed'),
    'urgent_open', count(*) filter (
      where severity = 'urgent'
        and status in ('pending', 'in_review')
    )
  )
  into report_metrics
  from public.user_reports;

  -- Daily moderation action totals over the last seven UTC days.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', days.day::date,
        'count', coalesce(actions.action_count, 0)
      )
      order by days.day::date
    ),
    '[]'::jsonb
  )
  into moderation_trend
  from generate_series(
    today_utc - 6,
    today_utc,
    interval '1 day'
  ) as days(day)
  left join lateral (
    select count(*) as action_count
    from public.moderation_actions m
    where m.created_at >= (days.day::date::timestamp at time zone 'UTC')
      and m.created_at < ((days.day::date + 1)::timestamp at time zone 'UTC')
  ) actions on true;

  return jsonb_build_object(
    'generated_at', statement_timestamp(),
    'active_members_24h', active_24h,
    'daily_active_members', daily_activity,
    'follower_growth', follower_growth,
    'top_posts', top_posts,
    'reports', report_metrics,
    'moderation_activity', moderation_trend
  );
end;
$$;

revoke all on function public.admin_get_advanced_analytics()
  from public, anon;

grant execute on function public.admin_get_advanced_analytics()
  to authenticated;





COMMIT;