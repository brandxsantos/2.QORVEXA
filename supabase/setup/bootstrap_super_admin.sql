-- Run once in the Supabase SQL Editor after creating and verifying the owner account.
-- Replace null::uuid with that account's UUID from Authentication > Users.
-- This trusted SQL-editor step is intentionally not exposed through the application.
do $$
declare
  owner_user_id uuid := null::uuid;
begin
  if owner_user_id is null then
    raise exception 'Set owner_user_id to the verified owner account UUID before running this script.';
  end if;

  if not exists (
    select 1 from auth.users where id = owner_user_id and email_confirmed_at is not null
  ) then
    raise exception 'The selected owner account does not exist or is not email-verified.';
  end if;

  if exists (select 1 from public.admin_roles where user_id = owner_user_id) then
    raise exception 'This account already has an administrator role.';
  end if;

  insert into public.admin_roles (user_id, role, granted_by)
  values (owner_user_id, 'super_admin', owner_user_id);

  insert into public.admin_audit_logs (actor_id, action, target_type, target_id, reason)
  values (
    owner_user_id,
    'super_admin.initialized',
    'user',
    owner_user_id::text,
    'Initial owner provisioning through the trusted Supabase SQL Editor.'
  );
end;
$$;
