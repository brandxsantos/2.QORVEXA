alter table public.admin_roles
  drop constraint if exists admin_roles_role_check;

alter table public.admin_roles
  add constraint admin_roles_role_check
  check (role in ('super_admin', 'admin', 'moderator', 'support'));

create table public.user_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  restriction_type text not null check (
    restriction_type in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests')
  ),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  issued_by uuid not null references auth.users (id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'revoked')),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint user_restrictions_expiry_after_start check (expires_at is null or expires_at > starts_at),
  constraint user_restrictions_revocation_consistent check (
    (status = 'active' and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null)
  )
);

create index user_restrictions_user_status_idx
  on public.user_restrictions (user_id, status, starts_at desc);
create index user_restrictions_active_expiry_idx
  on public.user_restrictions (expires_at)
  where status = 'active' and expires_at is not null;

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'post', 'comment', 'message')),
  target_id text not null check (char_length(target_id) between 1 and 200),
  category text not null check (
    category in ('spam', 'harassment', 'bullying', 'hate_speech', 'impersonation', 'scam', 'inappropriate', 'threats', 'misinformation', 'other')
  ),
  description text not null check (char_length(btrim(description)) between 5 and 2000),
  severity text not null default 'normal' check (severity in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'resolved', 'dismissed')),
  assigned_to uuid references auth.users (id) on delete set null,
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint user_reports_not_self check (reporter_id <> reported_user_id)
);

create unique index user_reports_one_open_report_idx
  on public.user_reports (reporter_id, target_type, target_id)
  where status in ('pending', 'in_review');
create index user_reports_queue_idx
  on public.user_reports (status, severity, created_at desc);
create index user_reports_target_user_idx
  on public.user_reports (reported_user_id, created_at desc);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users (id) on delete restrict,
  target_user_id uuid references auth.users (id) on delete set null,
  target_content_type text check (target_content_type is null or target_content_type in ('post', 'comment', 'message', 'profile')),
  target_content_id text,
  action_type text not null check (
    action_type in ('warning', 'restriction_applied', 'restriction_revoked', 'content_hidden', 'content_restored', 'report_resolved', 'report_dismissed')
  ),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);

alter table public.posts
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

alter table public.comments
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

create index moderation_actions_user_created_idx
  on public.moderation_actions (target_user_id, created_at desc);
create index moderation_actions_created_idx
  on public.moderation_actions (created_at desc);

alter table public.user_restrictions enable row level security;
alter table public.user_reports enable row level security;
alter table public.moderation_actions enable row level security;

revoke all on public.user_restrictions, public.user_reports, public.moderation_actions
  from public, anon, authenticated;

create function qorvexa_private.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.admin_roles where user_id = (select auth.uid());
$$;

create function qorvexa_private.can_review_reports()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(qorvexa_private.current_admin_role() in ('super_admin', 'admin', 'moderator', 'support'), false);
$$;

revoke all on function qorvexa_private.current_admin_role() from public, anon, authenticated;
revoke all on function qorvexa_private.can_review_reports() from public, anon, authenticated;

create policy "Users can read their own restrictions"
  on public.user_restrictions for select to authenticated
  using (user_id = (select auth.uid()));
grant select on public.user_restrictions to authenticated;

create policy "Authorized staff can review reports"
  on public.user_reports for select to authenticated
  using ((select qorvexa_private.can_review_reports()));

create function public.is_current_content_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(qorvexa_private.current_admin_role() in ('super_admin', 'admin', 'moderator'), false);
$$;

revoke all on function public.is_current_content_moderator() from public, anon;
grant execute on function public.is_current_content_moderator() to authenticated;

drop policy if exists "Signed-in members can read posts" on public.posts;
create policy "Signed-in members can read visible posts"
  on public.posts for select to authenticated
  using (not is_hidden or (select public.is_current_content_moderator()));

drop policy if exists "Signed-in members can read comments" on public.comments;
create policy "Signed-in members can read visible comments"
  on public.comments for select to authenticated
  using (not is_hidden or (select public.is_current_content_moderator()));

create policy "Administrators can read moderation history"
  on public.moderation_actions for select to authenticated
  using ((select public.is_current_admin()));

create function public.admin_get_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select qorvexa_private.current_admin_role();
$$;

create function public.admin_list_users(
  search_term text default '',
  status_filter text default 'all',
  page_offset integer default 0,
  page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  safe_limit integer := least(greatest(coalesce(page_size, 25), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
  normalized_term text := btrim(coalesce(search_term, ''));
  total_count bigint;
  user_rows jsonb;
begin
  if caller_role is null then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if status_filter not in ('all', 'active', 'restricted') then
    raise exception 'Invalid account status filter.';
  end if;

  with eligible as (
    select u.id, u.email, u.created_at, u.email_confirmed_at,
      p.username, p.display_name, p.avatar_url, p.last_active_at,
      coalesce(r.active_restrictions, '[]'::jsonb) as active_restrictions,
      ar.role as admin_role
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.admin_roles ar on ar.user_id = u.id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
          'id', ur.id,
          'type', ur.restriction_type,
          'reason', ur.reason,
          'starts_at', ur.starts_at,
          'expires_at', ur.expires_at
        ) order by ur.created_at desc) as active_restrictions
      from public.user_restrictions ur
      where ur.user_id = u.id and ur.status = 'active'
        and (ur.expires_at is null or ur.expires_at > statement_timestamp())
    ) r on true
    where (
      normalized_term = ''
      or u.id::text ilike '%' || normalized_term || '%'
      or coalesce(u.email, '') ilike '%' || normalized_term || '%'
      or coalesce(p.username, '') ilike '%' || normalized_term || '%'
      or coalesce(p.display_name, '') ilike '%' || normalized_term || '%'
    )
    and (
      status_filter = 'all'
      or (status_filter = 'active' and jsonb_array_length(coalesce(r.active_restrictions, '[]'::jsonb)) = 0)
      or (status_filter = 'restricted' and jsonb_array_length(coalesce(r.active_restrictions, '[]'::jsonb)) > 0)
    )
  )
  select count(*) into total_count from eligible;

  with eligible as (
    select u.id, u.email, u.created_at, u.email_confirmed_at,
      p.username, p.display_name, p.avatar_url, p.last_active_at,
      coalesce(r.active_restrictions, '[]'::jsonb) as active_restrictions,
      ar.role as admin_role
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.admin_roles ar on ar.user_id = u.id
    left join lateral (
      select jsonb_agg(jsonb_build_object(
          'id', ur.id,
          'type', ur.restriction_type,
          'reason', ur.reason,
          'starts_at', ur.starts_at,
          'expires_at', ur.expires_at
        ) order by ur.created_at desc) as active_restrictions
      from public.user_restrictions ur
      where ur.user_id = u.id and ur.status = 'active'
        and (ur.expires_at is null or ur.expires_at > statement_timestamp())
    ) r on true
    where (
      normalized_term = ''
      or u.id::text ilike '%' || normalized_term || '%'
      or coalesce(u.email, '') ilike '%' || normalized_term || '%'
      or coalesce(p.username, '') ilike '%' || normalized_term || '%'
      or coalesce(p.display_name, '') ilike '%' || normalized_term || '%'
    )
    and (
      status_filter = 'all'
      or (status_filter = 'active' and jsonb_array_length(coalesce(r.active_restrictions, '[]'::jsonb)) = 0)
      or (status_filter = 'restricted' and jsonb_array_length(coalesce(r.active_restrictions, '[]'::jsonb)) > 0)
    )
    order by u.created_at desc
    limit safe_limit offset safe_offset
  )
  select coalesce(jsonb_agg(to_jsonb(eligible)), '[]'::jsonb) into user_rows from eligible;

  return jsonb_build_object(
    'users', user_rows,
    'total', total_count,
    'offset', safe_offset,
    'limit', safe_limit
  );
end;
$$;

create function public.admin_apply_restriction(
  target_user_id uuid,
  restriction_type text,
  reason text,
  expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  restriction_id uuid;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Your administrator role cannot apply restrictions.' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'You cannot restrict your own account.';
  end if;
  if restriction_type not in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests') then
    raise exception 'Invalid restriction type.';
  end if;
  if char_length(btrim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'Provide a reason between 3 and 1000 characters.';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'The target account was not found.';
  end if;
  if caller_role = 'moderator' and (
    restriction_type not in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests')
    or expires_at is null
    or expires_at > statement_timestamp() + interval '7 days'
  ) then
    raise exception 'Moderators may issue warnings or restrictions lasting up to 7 days.';
  end if;
  if exists (
    select 1 from public.admin_roles
    where user_id = target_user_id and role = 'super_admin'
  ) then
    raise exception 'Super administrator accounts cannot be restricted from this panel.';
  end if;

  insert into public.user_restrictions (user_id, restriction_type, reason, issued_by, expires_at)
  values (target_user_id, restriction_type, btrim(reason), auth.uid(), expires_at)
  returning id into restriction_id;

  insert into public.moderation_actions (admin_id, target_user_id, action_type, reason)
  values (auth.uid(), target_user_id,
    case when restriction_type = 'warning' then 'warning' else 'restriction_applied' end,
    btrim(reason));
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'user.restriction_applied', 'user', target_user_id::text, btrim(reason),
    jsonb_build_object('restriction_id', restriction_id, 'restriction_type', restriction_type, 'expires_at', expires_at));
  return restriction_id;
end;
$$;

create function public.admin_revoke_restriction(restriction_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  restriction_row public.user_restrictions%rowtype;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Your administrator role cannot revoke restrictions.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'Provide a reason between 3 and 1000 characters.';
  end if;

  update public.user_restrictions
  set status = 'revoked', revoked_at = statement_timestamp(), revoked_by = auth.uid()
  where id = restriction_id and status = 'active'
    and (
      caller_role <> 'moderator'
      or (
        issued_by = auth.uid()
        and restriction_type in ('warning', 'posting', 'commenting', 'messaging', 'friend_requests')
        and expires_at is not null
      )
    )
  returning * into restriction_row;
  if not found then
    raise exception 'The restriction is unavailable or already revoked.';
  end if;

  insert into public.moderation_actions (admin_id, target_user_id, action_type, reason)
  values (auth.uid(), restriction_row.user_id, 'restriction_revoked', btrim(reason));
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'user.restriction_revoked', 'user', restriction_row.user_id::text, btrim(reason),
    jsonb_build_object('restriction_id', restriction_row.id));
end;
$$;

create function public.admin_list_reports(
  status_filter text default 'pending',
  page_offset integer default 0,
  page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  safe_limit integer := least(greatest(coalesce(page_size, 25), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
  report_rows jsonb;
  total_count bigint;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator', 'support') then
    raise exception 'Report access required.' using errcode = '42501';
  end if;
  if status_filter not in ('all', 'pending', 'in_review', 'resolved', 'dismissed') then
    raise exception 'Invalid report status.';
  end if;

  select count(*) into total_count
  from public.user_reports r
  where status_filter = 'all' or r.status = status_filter;

  select coalesce(jsonb_agg(to_jsonb(report_row)), '[]'::jsonb) into report_rows
  from (
    select r.id,
      case when caller_role = 'support' then null else r.reporter_id end as reporter_id,
      case when caller_role = 'support' then null else reporter.username end as reporter_username,
      case when caller_role = 'support' then null else reporter.display_name end as reporter_display_name,
      r.reported_user_id,
      target.username as reported_username, target.display_name as reported_display_name,
      r.target_type, r.target_id, r.category, r.description, r.severity, r.status,
      r.assigned_to, assignee.username as assignee_username,
      case when caller_role = 'support' then null else r.resolution end as resolution,
      r.created_at, r.updated_at, r.resolved_at
    from public.user_reports r
    left join public.profiles reporter on reporter.id = r.reporter_id
    left join public.profiles target on target.id = r.reported_user_id
    left join public.profiles assignee on assignee.id = r.assigned_to
    where status_filter = 'all' or r.status = status_filter
    order by case r.severity when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end, r.created_at
    limit safe_limit offset safe_offset
  ) report_row;

  return jsonb_build_object('reports', report_rows, 'total', total_count, 'offset', safe_offset, 'limit', safe_limit);
end;
$$;

create function public.admin_list_content(
  content_type text default 'post',
  search_term text default '',
  page_offset integer default 0,
  page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  safe_limit integer := least(greatest(coalesce(page_size, 25), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
  content_rows jsonb;
  total_count bigint;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Content moderation access required.' using errcode = '42501';
  end if;
  if content_type not in ('post', 'comment') then
    raise exception 'Invalid content type.';
  end if;

  if content_type = 'post' then
    select count(*) into total_count
    from public.posts p join public.profiles author on author.id = p.author_id
    where coalesce(search_term, '') = '' or p.content ilike '%' || search_term || '%'
      or author.username ilike '%' || search_term || '%' or author.display_name ilike '%' || search_term || '%';
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) into content_rows
    from (
      select p.id, p.author_id, author.username, author.display_name, p.content,
        p.created_at, p.is_hidden, p.hidden_at, p.hidden_reason
      from public.posts p
      join public.profiles author on author.id = p.author_id
      where coalesce(search_term, '') = '' or p.content ilike '%' || search_term || '%'
        or author.username ilike '%' || search_term || '%' or author.display_name ilike '%' || search_term || '%'
      order by p.created_at desc
      limit safe_limit offset safe_offset
    ) row_data;
  else
    select count(*) into total_count
    from public.comments c join public.profiles author on author.id = c.author_id
    where coalesce(search_term, '') = '' or c.content ilike '%' || search_term || '%'
      or author.username ilike '%' || search_term || '%' or author.display_name ilike '%' || search_term || '%';
    select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb) into content_rows
    from (
      select c.id, c.post_id, c.parent_id, c.author_id, author.username, author.display_name,
        c.content, c.created_at, c.is_hidden, c.hidden_at, c.hidden_reason
      from public.comments c
      join public.profiles author on author.id = c.author_id
      where coalesce(search_term, '') = '' or c.content ilike '%' || search_term || '%'
        or author.username ilike '%' || search_term || '%' or author.display_name ilike '%' || search_term || '%'
      order by c.created_at desc
      limit safe_limit offset safe_offset
    ) row_data;
  end if;
  return jsonb_build_object('items', content_rows, 'total', total_count, 'offset', safe_offset, 'limit', safe_limit);
end;
$$;

create function public.admin_moderate_content(
  content_type text,
  content_id uuid,
  hide_content boolean,
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  affected_user uuid;
  changed_id uuid;
  action_name text := case when hide_content then 'content_hidden' else 'content_restored' end;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Content moderation access required.' using errcode = '42501';
  end if;
  if content_type not in ('post', 'comment') or content_id is null then
    raise exception 'Invalid moderation target.';
  end if;
  if char_length(btrim(coalesce(reason, ''))) not between 3 and 1000 then
    raise exception 'Provide a moderation reason between 3 and 1000 characters.';
  end if;

  if content_type = 'post' then
    update public.posts
    set is_hidden = hide_content,
        hidden_by = case when hide_content then auth.uid() else null end,
        hidden_at = case when hide_content then statement_timestamp() else null end,
        hidden_reason = case when hide_content then btrim(reason) else null end
    where id = content_id
    returning author_id, id into affected_user, changed_id;
  else
    update public.comments
    set is_hidden = hide_content,
        hidden_by = case when hide_content then auth.uid() else null end,
        hidden_at = case when hide_content then statement_timestamp() else null end,
        hidden_reason = case when hide_content then btrim(reason) else null end
    where id = content_id
    returning author_id, id into affected_user, changed_id;
  end if;

  if changed_id is null then
    raise exception 'The content was not found.';
  end if;
  insert into public.moderation_actions (
    admin_id, target_user_id, target_content_type, target_content_id, action_type, reason
  ) values (auth.uid(), affected_user, content_type, changed_id::text, action_name, btrim(reason));
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'content.' || case when hide_content then 'hidden' else 'restored' end,
    content_type, changed_id::text, btrim(reason), jsonb_build_object('target_user_id', affected_user));
end;
$$;

create function public.submit_user_report(
  reported_user_id uuid,
  target_type text,
  target_id text,
  category text,
  description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid := auth.uid();
  report_id uuid;
begin
  if reporter is null then
    raise exception 'Sign in to submit a report.' using errcode = '42501';
  end if;
  if reported_user_id is null or reported_user_id = reporter then
    raise exception 'You cannot report your own account.';
  end if;
  if target_type not in ('user', 'post', 'comment', 'message') or char_length(btrim(coalesce(target_id, ''))) not between 1 and 200 then
    raise exception 'Invalid report target.';
  end if;
  if category not in ('spam', 'harassment', 'bullying', 'hate_speech', 'impersonation', 'scam', 'inappropriate', 'threats', 'misinformation', 'other') then
    raise exception 'Select a valid report category.';
  end if;
  if char_length(btrim(coalesce(description, ''))) not between 5 and 2000 then
    raise exception 'Describe the issue in 5 to 2000 characters.';
  end if;
  if not exists (select 1 from auth.users where id = reported_user_id) then
    raise exception 'The reported account was not found.';
  end if;
  if target_type = 'user' and target_id <> reported_user_id::text then
    raise exception 'The report target does not match the reported account.';
  elsif target_type = 'post' and not exists (
    select 1 from public.posts where id::text = target_id and author_id = reported_user_id
  ) then
    raise exception 'The reported post was not found or does not belong to that account.';
  elsif target_type = 'comment' and not exists (
    select 1 from public.comments where id::text = target_id and author_id = reported_user_id
  ) then
    raise exception 'The reported comment was not found or does not belong to that account.';
  elsif target_type = 'message' and not exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id::text = target_id
      and m.sender_id = reported_user_id
      and reporter in (c.user_low, c.user_high)
  ) then
    raise exception 'The message is not part of a conversation you can report.';
  end if;
  if (
    select count(*) from public.user_reports
    where reporter_id = reporter and created_at > statement_timestamp() - interval '1 hour'
  ) >= 10 then
    raise exception 'You have reached the report limit. Try again later.';
  end if;

  insert into public.user_reports (reporter_id, reported_user_id, target_type, target_id, category, description)
  values (reporter, reported_user_id, target_type, btrim(target_id), category, btrim(description))
  returning id into report_id;
  return report_id;
exception
  when unique_violation then
    raise exception 'You already have an open report for this item.';
end;
$$;

create function public.admin_update_report(
  report_id uuid,
  new_status text,
  resolution_note text default null,
  assignee_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  report_row public.user_reports%rowtype;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator', 'support') then
    raise exception 'Report access required.' using errcode = '42501';
  end if;
  if caller_role = 'support' then
    raise exception 'Support can read reports but cannot change report status.' using errcode = '42501';
  end if;
  if new_status not in ('pending', 'in_review', 'resolved', 'dismissed') then
    raise exception 'Invalid report status.';
  end if;
  if resolution_note is not null and char_length(resolution_note) > 2000 then
    raise exception 'Resolution note is too long.';
  end if;
  if assignee_id is not null and not exists (
    select 1 from public.admin_roles where user_id = assignee_id
  ) then
    raise exception 'Assignee must have an administrator role.';
  end if;

  update public.user_reports
  set status = new_status,
      resolution = nullif(btrim(coalesce(resolution_note, '')), ''),
      assigned_to = coalesce(assignee_id, assigned_to),
      resolved_by = case when new_status in ('resolved', 'dismissed') then auth.uid() else null end,
      resolved_at = case when new_status in ('resolved', 'dismissed') then statement_timestamp() else null end,
      updated_at = statement_timestamp()
  where id = report_id
  returning * into report_row;
  if not found then
    raise exception 'Report not found.';
  end if;

  if new_status in ('resolved', 'dismissed') then
    insert into public.moderation_actions (admin_id, target_user_id, target_content_type, target_content_id, action_type, reason)
    values (auth.uid(), report_row.reported_user_id, report_row.target_type, report_row.target_id,
      case when new_status = 'resolved' then 'report_resolved' else 'report_dismissed' end,
      coalesce(nullif(btrim(resolution_note), ''), 'Report ' || new_status || '.'));
    insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
    values (auth.uid(), 'report.' || new_status, 'report', report_id::text,
      coalesce(nullif(btrim(resolution_note), ''), 'Report ' || new_status || '.'),
      jsonb_build_object('reported_user_id', report_row.reported_user_id, 'category', report_row.category));
  else
    insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
    values (auth.uid(), 'report.' || new_status, 'report', report_id::text,
      'Report status updated by staff.',
      jsonb_build_object('reported_user_id', report_row.reported_user_id, 'assigned_to', report_row.assigned_to));
  end if;
end;
$$;

create function public.admin_list_audit_logs(
  search_term text default '',
  page_offset integer default 0,
  page_size integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := qorvexa_private.current_admin_role();
  safe_limit integer := least(greatest(coalesce(page_size, 50), 1), 100);
  safe_offset integer := greatest(coalesce(page_offset, 0), 0);
  logs jsonb;
  total_count bigint;
begin
  if caller_role is null or caller_role not in ('super_admin', 'admin', 'moderator') then
    raise exception 'Audit log access required.' using errcode = '42501';
  end if;
  select count(*) into total_count
  from public.admin_audit_logs l
  where coalesce(search_term, '') = ''
    or l.action ilike '%' || search_term || '%'
    or coalesce(l.target_id, '') ilike '%' || search_term || '%'
    or l.actor_id::text ilike '%' || search_term || '%';
  select coalesce(jsonb_agg(to_jsonb(log_row)), '[]'::jsonb) into logs
  from (
    select l.id, l.actor_id, p.username as actor_username, l.action, l.target_type,
      l.target_id, l.reason, l.details, l.created_at
    from public.admin_audit_logs l
    left join public.profiles p on p.id = l.actor_id
    where coalesce(search_term, '') = ''
      or l.action ilike '%' || search_term || '%'
      or coalesce(l.target_id, '') ilike '%' || search_term || '%'
      or l.actor_id::text ilike '%' || search_term || '%'
    order by l.created_at desc
    limit safe_limit offset safe_offset
  ) log_row;
  return jsonb_build_object('logs', logs, 'total', total_count, 'offset', safe_offset, 'limit', safe_limit);
end;
$$;

create function public.admin_list_roles()
returns table (user_id uuid, username text, display_name text, role text, granted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if qorvexa_private.current_admin_role() is distinct from 'super_admin' then
    raise exception 'Only a super administrator can manage roles.' using errcode = '42501';
  end if;
  return query
    select ar.user_id, p.username, p.display_name, ar.role, ar.granted_at
    from public.admin_roles ar
    left join public.profiles p on p.id = ar.user_id
    order by ar.granted_at;
end;
$$;

create function public.admin_set_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_role text;
begin
  if qorvexa_private.current_admin_role() is distinct from 'super_admin' then
    raise exception 'Only a super administrator can manage roles.' using errcode = '42501';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    raise exception 'You cannot change your own administrator role.';
  end if;
  if new_role not in ('super_admin', 'admin', 'moderator', 'support', 'none') then
    raise exception 'Invalid administrator role.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-role-management', 0));
  select role into existing_role from public.admin_roles where user_id = target_user_id for update;
  if existing_role = 'super_admin' and new_role <> 'super_admin'
      and (select count(*) from public.admin_roles where role = 'super_admin') <= 1 then
    raise exception 'The last super administrator cannot be demoted or removed.';
  end if;
  if new_role = 'none' then
    delete from public.admin_roles where user_id = target_user_id;
  else
    insert into public.admin_roles (user_id, role, granted_by)
    values (target_user_id, new_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = statement_timestamp();
  end if;
  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason, details)
  values (auth.uid(), 'admin.role_changed', 'user', target_user_id::text,
    'Administrator role changed through the admin dashboard.',
    jsonb_build_object('previous_role', existing_role, 'new_role', new_role));
end;
$$;

create function public.can_current_user_post()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.user_restrictions
    where user_id = auth.uid() and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = 'posting'
  );
$$;

create function public.can_current_user_comment()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.user_restrictions
    where user_id = auth.uid() and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = 'commenting'
  );
$$;

create function public.can_current_user_message()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.user_restrictions
    where user_id = auth.uid() and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = 'messaging'
  );
$$;

create function public.enforce_user_restrictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  needed_type text;
  current_user_id uuid := auth.uid();
  matched_restriction public.user_restrictions%rowtype;
begin
  needed_type := case tg_table_name
    when 'posts' then 'posting'
    when 'comments' then 'commenting'
    when 'messages' then 'messaging'
    else null
  end;
  if current_user_id is not null then
    select * into matched_restriction
    from public.user_restrictions
    where user_id = current_user_id and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = needed_type
    order by starts_at desc
    limit 1;
  end if;
  if matched_restriction.id is not null then
    raise exception 'Your account is restricted from this action. Reason: %. %',
      matched_restriction.reason,
      case when matched_restriction.expires_at is null then 'Contact support if you believe this is a mistake.'
        else 'This restriction ends at ' || matched_restriction.expires_at::text || '. Contact support if you believe this is a mistake.' end;
  end if;
  return new;
end;
$$;

revoke all on function public.admin_get_role() from public, anon;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
revoke all on function public.admin_apply_restriction(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.admin_revoke_restriction(uuid, text) from public, anon;
revoke all on function public.admin_list_reports(text, integer, integer) from public, anon;
revoke all on function public.admin_list_content(text, text, integer, integer) from public, anon;
revoke all on function public.admin_moderate_content(text, uuid, boolean, text) from public, anon;
revoke all on function public.submit_user_report(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_update_report(uuid, text, text, uuid) from public, anon;
revoke all on function public.admin_list_audit_logs(text, integer, integer) from public, anon;
revoke all on function public.admin_list_roles() from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.can_current_user_post() from public, anon;
revoke all on function public.can_current_user_comment() from public, anon;
revoke all on function public.can_current_user_message() from public, anon;
revoke all on function public.enforce_user_restrictions() from public, anon, authenticated;

grant execute on function public.admin_get_role() to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_apply_restriction(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.admin_revoke_restriction(uuid, text) to authenticated;
grant execute on function public.admin_list_reports(text, integer, integer) to authenticated;
grant execute on function public.admin_list_content(text, text, integer, integer) to authenticated;
grant execute on function public.admin_moderate_content(text, uuid, boolean, text) to authenticated;
grant execute on function public.submit_user_report(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_update_report(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_list_audit_logs(text, integer, integer) to authenticated;
grant execute on function public.admin_list_roles() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.can_current_user_post() to authenticated;
grant execute on function public.can_current_user_comment() to authenticated;
grant execute on function public.can_current_user_message() to authenticated;

create trigger posts_enforce_user_restrictions
  before insert on public.posts
  for each row execute function public.enforce_user_restrictions();
create trigger comments_enforce_user_restrictions
  before insert on public.comments
  for each row execute function public.enforce_user_restrictions();
create trigger messages_enforce_user_restrictions
  before insert on public.messages
  for each row execute function public.enforce_user_restrictions();

drop policy if exists "Members can publish posts as themselves" on public.posts;
create policy "Members can publish posts as themselves"
  on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id and (select public.can_current_user_post()));

drop policy if exists "Members can comment as themselves" on public.comments;
create policy "Members can comment as themselves"
  on public.comments for insert to authenticated
  with check ((select auth.uid()) = author_id and (select public.can_current_user_comment()));

drop policy if exists "Friends can send messages in their conversation" on public.messages;
create policy "Friends can send messages in their conversation"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.can_current_user_message())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (select auth.uid()) in (c.user_low, c.user_high)
        and exists (
          select 1 from public.friendships f
          where f.user_low = c.user_low and f.user_high = c.user_high
        )
    )
  );

create or replace function public.send_friend_request(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  request_id uuid;
begin
  if current_user_id is null or target_user_id is null then
    raise exception 'Sign in and select a user to send a request.';
  end if;
  if current_user_id = target_user_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;
  if exists (
    select 1 from public.user_restrictions
    where user_id = current_user_id and status = 'active'
      and (expires_at is null or expires_at > statement_timestamp())
      and restriction_type = 'friend_requests'
  ) then
    raise exception 'Friend requests are unavailable for this account due to an active restriction.';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'That user profile could not be found.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(current_user_id::text, target_user_id::text) || ':' ||
    greatest(current_user_id::text, target_user_id::text), 0
  ));
  if qorvexa_private.are_friends(current_user_id, target_user_id) then
    raise exception 'You are already friends.';
  end if;
  if exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((sender_id = current_user_id and receiver_id = target_user_id)
        or (sender_id = target_user_id and receiver_id = current_user_id))
  ) then
    raise exception 'A pending friend request already exists between these users.';
  end if;

  insert into public.friend_requests (sender_id, receiver_id)
  values (current_user_id, target_user_id)
  returning id into request_id;
  insert into public.notifications (user_id, actor_id, type, reference_id)
  values (target_user_id, current_user_id, 'friend_request', request_id);
  return request_id;
end;
$$;
