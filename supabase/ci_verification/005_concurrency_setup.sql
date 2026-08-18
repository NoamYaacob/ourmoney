-- Fixture data for the true-concurrency check. See README.md in this
-- directory. IDs are dedicated to this CI run and distinct from every
-- fixture already used in supabase/rls_tests.sql.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000070', 'authenticated', 'authenticated', 'ci-leave-race-1@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"CI Leave Race 1"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000071', 'authenticated', 'authenticated', 'ci-leave-race-2@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"CI Leave Race 2"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('77777777-7777-7777-7777-777777777777', 'CI concurrency probe', 'f0000000-0000-0000-0000-000000000070');

INSERT INTO household_members (household_id, user_id, role) VALUES
  ('77777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-000000000070', 'admin'),
  ('77777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-000000000071', 'member');
