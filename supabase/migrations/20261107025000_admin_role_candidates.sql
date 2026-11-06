create function public.admin_search_role_candidates(search_term text)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_term text := lower(btrim(coalesce(search_term, '')));
begin
  if qorvexa_private.current_admin_role() is distinct from 'super_admin' then
    raise exception 'Only a super administrator can manage roles.' using errcode = '42501';
  end if;
  if char_length(normalized_term) < 2 then
    raise exception 'Enter at least 2 characters to search for a member.';
  end if;

  return query
    select u.id, u.email::text, p.username, p.display_name, u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id <> auth.uid()
      and u.email_confirmed_at is not null
      and not exists (
        select 1 from public.admin_roles ar where ar.user_id = u.id
      )
      and (
        position(normalized_term in lower(coalesce(u.email, ''))) > 0
        or position(normalized_term in lower(coalesce(p.username, ''))) > 0
        or position(normalized_term in lower(coalesce(p.display_name, ''))) > 0
      )
    order by u.created_at desc
    limit 20;
end;
$$;

revoke all on function public.admin_search_role_candidates(text) from public, anon;
grant execute on function public.admin_search_role_candidates(text) to authenticated;
