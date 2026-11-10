-- pgTAP tests for reserved admin identities limiter.
-- Run with: pg_prove -d <database> supabase/tests/20261110040000_reserved_admin_identity.test.sql

begin;

select plan(9);

-- 1. Helper function checks
select is(
  qorvexa_private.is_reserved_identity('QORVEXA'),
  true,
  'qorvexa_private.is_reserved_identity returns true for QORVEXA'
);

select is(
  qorvexa_private.is_reserved_identity('Admin'),
  true,
  'qorvexa_private.is_reserved_identity returns true for Admin'
);

select is(
  qorvexa_private.is_reserved_identity('QORVEXA Admin'),
  true,
  'qorvexa_private.is_reserved_identity returns true for QORVEXA Admin'
);

select is(
  qorvexa_private.is_reserved_identity('qorvexa_admin'),
  true,
  'qorvexa_private.is_reserved_identity returns true for qorvexa_admin'
);

select is(
  qorvexa_private.is_reserved_identity('John Doe'),
  false,
  'qorvexa_private.is_reserved_identity returns false for John Doe'
);

select is(
  qorvexa_private.is_reserved_identity('Vladimir'),
  false,
  'qorvexa_private.is_reserved_identity returns false for Vladimir'
);

-- 2. Create normal test user and super_admin test user
insert into auth.users (id, email, encrypted_password, aud, role)
values
  ('44444444-4444-4444-4444-444444444444', 'normal@test.local', 'x', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'owner@test.local', 'x', 'authenticated', 'authenticated');

insert into public.admin_roles (user_id, role, granted_by)
values
  ('55555555-5555-5555-5555-555555555555', 'super_admin', '55555555-5555-5555-5555-555555555555');

insert into public.profiles (id, username, display_name)
values
  ('44444444-4444-4444-4444-444444444444', 'normal_user', 'Normal User');

-- 3. Normal user attempting to use reserved username should throw exception
select throws_ok(
  $$ update public.profiles set username = 'qorvexa' where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514',
  'The username "qorvexa" is reserved for platform administrators.',
  'Normal user cannot take reserved username qorvexa'
);

-- 4. Normal user attempting to use reserved display name should throw exception
select throws_ok(
  $$ update public.profiles set display_name = 'QORVEXA Admin' where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514',
  'The display name "QORVEXA Admin" is reserved for platform administrators.',
  'Normal user cannot take reserved display name QORVEXA Admin'
);

-- 5. Super admin is allowed to take reserved username and display name
select lives_ok(
  $$ insert into public.profiles (id, username, display_name) values ('55555555-5555-5555-5555-555555555555', 'qorvexa', 'QORVEXA Admin') $$,
  'Super administrator can use reserved username and display name'
);

rollback;
