create or replace function public.search_hashtag_suggestions(
  search_prefix text,
  result_limit integer default 6
)
returns table (
  hashtag text,
  post_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    lower(matches.parts[2]) as hashtag,
    count(distinct p.id) as post_count
  from public.posts p
  cross join lateral pg_catalog.regexp_matches(
    coalesce(p.content, ''),
    '(^|[^[:alnum:]_])#([[:alnum:]_]{1,50})',
    'g'
  ) as matches(parts)
  where
    search_prefix is not null
    and length(search_prefix) between 1 and 50
    and not p.is_hidden
    and left(
      lower(matches.parts[2]),
      length(search_prefix)
    ) = lower(search_prefix)
  group by lower(matches.parts[2])
  order by count(distinct p.id) desc, lower(matches.parts[2]) asc
  limit greatest(1, least(coalesce(result_limit, 6), 20));
$$;

revoke all on function public.search_hashtag_suggestions(text, integer)
  from public;

grant execute on function public.search_hashtag_suggestions(text, integer)
  to anon, authenticated;
