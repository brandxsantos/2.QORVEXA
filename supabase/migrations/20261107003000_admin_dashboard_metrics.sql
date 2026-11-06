create or replace function public.admin_get_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_count bigint;
  account_metrics jsonb;
  registration_trend jsonb;
begin
  if not qorvexa_private.is_admin() then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  select count(*) into profile_count
  from public.profiles;

  select jsonb_build_object(
    'total_users', count(*),
    'verified_users', count(*) filter (where email_confirmed_at is not null),
    'unverified_users', count(*) filter (where email_confirmed_at is null),
    'registered_today', count(*) filter (
      where created_at >= date_trunc('day', statement_timestamp())
    ),
    'registered_last_7_days', count(*) filter (
      where created_at >= statement_timestamp() - interval '7 days'
    ),
    'registered_this_month', count(*) filter (
      where created_at >= date_trunc('month', statement_timestamp())
    )
  ) into account_metrics
  from auth.users;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(days.day, 'YYYY-MM-DD'),
        'count', coalesce(daily.registration_count, 0)
      )
      order by days.day
    ),
    '[]'::jsonb
  ) into registration_trend
  from generate_series(
    date_trunc('day', statement_timestamp()) - interval '6 days',
    date_trunc('day', statement_timestamp()),
    interval '1 day'
  ) as days(day)
  left join lateral (
    select count(*) as registration_count
    from auth.users
    where created_at >= days.day
      and created_at < days.day + interval '1 day'
  ) as daily on true;

  return jsonb_build_object(
    'registered_profiles', profile_count,
    'account_metrics', account_metrics,
    'registration_trend', registration_trend,
    'generated_at', statement_timestamp(),
    'social_tables_ready', jsonb_build_object(
      'posts', to_regclass('public.posts') is not null,
      'comments', to_regclass('public.comments') is not null,
      'follows', to_regclass('public.follows') is not null,
      'groups', to_regclass('public.groups') is not null,
      'messages', to_regclass('public.messages') is not null,
      'stories', to_regclass('public.stories') is not null
    )
  );
end;
$$;

revoke all on function public.admin_get_overview() from public, anon;
grant execute on function public.admin_get_overview() to authenticated;
