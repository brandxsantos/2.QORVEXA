-- pgTAP tests for QORVEXA Instants: view-once, expiration, close friends, reactions.
-- Run with: pg_prove -d <database> supabase/tests/20261110050000_qorvexa_instants.test.sql

begin;

select plan(10);

-- 1. Setup test users: sender, friend_a, friend_b, non_friend
insert into auth.users (id, email, encrypted_password, aud, role)
values
  ('11111111-aaaa-1111-aaaa-111111111111', 'sender@test.local', 'x', 'authenticated', 'authenticated'),
  ('22222222-bbbb-2222-bbbb-222222222222', 'friend_a@test.local', 'x', 'authenticated', 'authenticated'),
  ('33333333-cccc-3333-cccc-333333333333', 'friend_b@test.local', 'x', 'authenticated', 'authenticated'),
  ('44444444-dddd-4444-dddd-444444444444', 'outsider@test.local', 'x', 'authenticated', 'authenticated');

insert into public.profiles (id, username, display_name)
values
  ('11111111-aaaa-1111-aaaa-111111111111', 'sender_u', 'Sender User'),
  ('22222222-bbbb-2222-bbbb-222222222222', 'friend_a_u', 'Friend A'),
  ('33333333-cccc-3333-cccc-333333333333', 'friend_b_u', 'Friend B'),
  ('44444444-dddd-4444-dddd-444444444444', 'outsider_u', 'Outsider User');

-- 2. Setup friendships
insert into public.friendships (user_low, user_high, status)
values
  (least('11111111-aaaa-1111-aaaa-111111111111'::uuid, '22222222-bbbb-2222-bbbb-222222222222'::uuid),
   greatest('11111111-aaaa-1111-aaaa-111111111111'::uuid, '22222222-bbbb-2222-bbbb-222222222222'::uuid),
   'accepted'),
  (least('11111111-aaaa-1111-aaaa-111111111111'::uuid, '33333333-cccc-3333-cccc-333333333333'::uuid),
   greatest('11111111-aaaa-1111-aaaa-111111111111'::uuid, '33333333-cccc-3333-cccc-333333333333'::uuid),
   'accepted');

-- 3. Set friend_a as Close Friend
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}';

select is(
  public.set_close_friend('22222222-bbbb-2222-bbbb-222222222222', true),
  true,
  'Sender can add friend_a to Close Friends'
);

-- 4. Create an Instant for Close Friends (should only distribute to friend_a)
select is(
  (public.create_instant('11111111-aaaa-1111-aaaa-111111111111/test.jpg', 'Close friends exclusive', 'close_friends') ->> 'recipient_count')::int,
  1,
  'Close friends Instant distributed only to 1 recipient (friend_a)'
);

-- 5. Create an Instant for Friends (should distribute to both friend_a and friend_b)
select is(
  (public.create_instant('11111111-aaaa-1111-aaaa-111111111111/test2.jpg', 'Hello all friends', 'friends') ->> 'recipient_count')::int,
  2,
  'Friends Instant distributed to both accepted friends'
);

-- 6. Friend B views the Instant (first view succeeds)
set local request.jwt.claims = '{"sub": "33333333-cccc-3333-cccc-333333333333", "role": "authenticated"}';

select lives_ok(
  $$ select public.consume_and_view_instant((select id from public.instants where caption = 'Hello all friends')) $$,
  'Friend B successfully consumed and viewed Instant'
);

-- 7. View-Once Enforcement: Friend B tries to view again (must throw exception)
select throws_ok(
  $$ select public.consume_and_view_instant((select id from public.instants where caption = 'Hello all friends')) $$,
  'P0001',
  'This Instant has already been viewed.',
  'Friend B is blocked from viewing Instant a second time (view-once)'
);

-- 8. Independent Viewing State: Friend A can still view the same Instant
set local request.jwt.claims = '{"sub": "22222222-bbbb-2222-bbbb-222222222222", "role": "authenticated"}';

select lives_ok(
  $$ select public.consume_and_view_instant((select id from public.instants where caption = 'Hello all friends')) $$,
  'Friend A can still view the Instant independently (not consumed by Friend B)'
);

-- 9. Reaction to Instant
select is(
  (public.set_instant_reaction((select id from public.instants where caption = 'Hello all friends'), '🔥') ->> 'reaction'),
  '🔥',
  'Friend A reacted with fire emoji'
);

-- 10. Outsider cannot view the Instant
set local request.jwt.claims = '{"sub": "44444444-dddd-4444-dddd-444444444444", "role": "authenticated"}';

select throws_ok(
  $$ select public.consume_and_view_instant((select id from public.instants where caption = 'Hello all friends')) $$,
  'P0001',
  'You are not an authorized recipient of this Instant.',
  'Outsider is blocked from viewing Instant'
);

-- 11. Sender archive inspection
set local request.jwt.claims = '{"sub": "11111111-aaaa-1111-aaaa-111111111111", "role": "authenticated"}';

select is(
  jsonb_array_length(public.get_sent_instants_archive()),
  2,
  'Sender sees 2 sent Instants in their private archive'
);

rollback;
