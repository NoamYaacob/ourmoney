-- ============================================================================
-- OurMoney — RLS Security Test Suite (Milestone 2 / MVP-1)
-- ============================================================================
--
-- Run:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/rls_tests.sql
--
-- Coverage matches docs/PHASE_1_PLAN.md §2.5 — the MVP-1 subset of the full
-- test matrix in docs/DATABASE_SCHEMA.md#rls-security-tests. Groups 1/2/3
-- cover only the sub-tests that apply to tables created in migration 001
-- (profiles, households, household_members, invitations); the remaining
-- sub-tests in those groups need financial tables and land with migration
-- 002 in MVP-2. Groups 3b, 3c, 5, and 6 are implemented in full.
--
-- Design: every test impersonates a role via `SET LOCAL role` +
-- `SET LOCAL request.jwt.claims` (the technique DATABASE_SCHEMA.md
-- specifies), performs the operation inside a DO block, and asserts the
-- outcome. Every test that mutates data runs inside its own SAVEPOINT that
-- is rolled back immediately after — the database is never left modified.
-- A failing assertion RAISE EXCEPTIONs, which — run with -v ON_ERROR_STOP=1
-- — aborts the whole script immediately (fail fast, first failure wins). A
-- passing assertion is logged via the _pass() helper below and counted.
--
-- Test 5.9 (true concurrency) is the one exception: it needs a second real
-- connection to race against the first, which requires committed data that
-- connection can see. It runs as an isolated, self-cleaning section after
-- the main transaction, clearly marked below.

BEGIN;

-- ----------------------------------------------------------------------------
-- Test bookkeeping
-- ----------------------------------------------------------------------------

-- A sequence, not a table: nextval() is specifically exempted from
-- transactional rollback in Postgres, so the count survives every test's
-- SAVEPOINT ... ROLLBACK TO SAVEPOINT (a regular table's row updates would
-- not — they'd be silently undone along with each test's own rollback).
CREATE TEMP SEQUENCE _test_seq;

CREATE OR REPLACE FUNCTION _pass(p_id TEXT, p_msg TEXT) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_temp, public
AS $$
BEGIN
  PERFORM nextval('_test_seq');
  RAISE NOTICE 'PASS %: %', p_id, p_msg;
END $$;

-- Test scaffolding only (not a security boundary): several tests call
-- _pass() while still impersonating authenticated/anon to log a passing
-- assertion inline. SECURITY DEFINER makes it run as the owning (postgres)
-- role regardless of caller, so no direct GRANT on _test_counter is needed.
REVOKE ALL ON FUNCTION _pass(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _pass(TEXT, TEXT) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
-- Household 1: User A (admin), User B (member)
-- Household 2: User C (admin)
-- User D: authenticated, no household
-- User E: authenticated, no household (spare — used where a second
--         no-household user is needed alongside D in the same test)
--
-- Fixed literal UUIDs/tokens throughout for readability and reproducibility.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user-a@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User A"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'user-b@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User B"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'user-c@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User C"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'authenticated', 'authenticated', 'user-d@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User D"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated', 'authenticated', 'user-e@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User E"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('11111111-1111-1111-1111-111111111111', 'משפחת בדיקה 1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'משפחת בדיקה 2', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

INSERT INTO household_members (household_id, user_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member'),
  ('22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin');

INSERT INTO invitations (id, household_id, invited_by, token, status, expires_at) VALUES
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tok-h1-pending',   'pending',   NOW() + INTERVAL '7 days'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tok-h1-expired',   'pending',   NOW() - INTERVAL '1 day'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tok-h1-cancelled', 'cancelled', NOW() + INTERVAL '7 days'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tok-h1-accepted',  'accepted',  NOW() + INTERVAL '7 days'),
  ('a0000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'tok-h2-pending',   'pending',   NOW() + INTERVAL '7 days');

DO $$ BEGIN RAISE NOTICE '=== fixtures loaded ==='; END $$;

-- ============================================================================
-- Group 1 — Cross-household isolation (MVP-1 subset: 1.12-1.14)
-- ============================================================================

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM invitations WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.12: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.12', 'User A cannot SELECT Household 2 invitations');
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM household_members WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.13: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.13', 'User A cannot SELECT Household 2 household_members');
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM households WHERE id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.14: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.14', 'User A cannot SELECT Household 2 in households');
END $$;
RESET role;

-- ============================================================================
-- Group 2 — Unaffiliated user (MVP-1 subset: 2.1, 2.6)
-- ============================================================================

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM households;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.1: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.1', 'User D (no household) SELECTs households => 0 rows');
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM invitations;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.6: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.6', 'User D (no household) SELECTs invitations => 0 rows');
END $$;
RESET role;

-- ============================================================================
-- Group 3 — Role enforcement within a household (MVP-1 subset: 3.3,3.4,3.7,3.8)
-- ============================================================================

-- 3.3: User B (member) creates an invitation for Household 1 => rejected (admin only)
SAVEPOINT sp_3_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO invitations (household_id, invited_by) VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'FAIL 3.3: member was able to create an invitation';
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM _pass('3.3', 'member cannot create a Household 1 invitation (admin only)');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_3;

-- 3.4: User B UPDATEs the Household 1 name => 0 rows affected (admin only)
SAVEPOINT sp_3_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT := 0;
BEGIN
  BEGIN
    UPDATE households SET name = 'שם שהוחלף בזדון' WHERE id = '11111111-1111-1111-1111-111111111111';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3.4: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('3.4', 'member cannot UPDATE the Household 1 name (admin only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_4;

-- 3.7: User B removes themselves from household_members => succeeds
SAVEPOINT sp_3_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL 3.7: expected 1 row deleted, got %', v_rows; END IF;
  PERFORM _pass('3.7', 'member can remove themselves from household_members');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_7;

-- 3.8: User A (admin) removes User B => succeeds
SAVEPOINT sp_3_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL 3.8: expected 1 row deleted, got %', v_rows; END IF;
  PERFORM _pass('3.8', 'admin can remove another member from household_members');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_8;

-- ============================================================================
-- Group 3b — Membership tampering (full, non-negotiable)
-- ============================================================================

-- 3b.1: User D INSERTs themselves into Household 1 directly => rejected
SAVEPOINT sp_3b_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (household_id, user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'member');
    RAISE EXCEPTION 'FAIL 3b.1: User D inserted themselves into Household 1';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3b.1', 'User D cannot INSERT themselves into household_members (no INSERT policy)');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_1;

-- 3b.2: User B INSERTs a second row for themselves with role='admin' => rejected
SAVEPOINT sp_3b_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (household_id, user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin');
    RAISE EXCEPTION 'FAIL 3b.2: User B inserted a duplicate admin row for themselves';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3b.2', 'User B cannot INSERT a second admin row for themselves');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_2;

-- 3b.3: User B DELETEs their own row, then re-INSERTs it as admin => delete succeeds, insert rejected
SAVEPOINT sp_3b_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL 3b.3: expected the self-delete to affect 1 row, got %', v_rows; END IF;

  BEGIN
    INSERT INTO household_members (household_id, user_id, role) VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin');
    RAISE EXCEPTION 'FAIL 3b.3: User B re-inserted themselves as admin after self-deleting';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3b.3', 'delete-then-reinsert-as-admin: delete succeeds, re-insert is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_3;

-- 3b.4: User B UPDATEs their own row to role='admin' => rejected (no UPDATE policy)
SAVEPOINT sp_3b_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT := 0;
BEGIN
  BEGIN
    UPDATE household_members SET role = 'admin' WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3b.4: expected 0 rows affected (or rejection), got %', v_rows; END IF;
  PERFORM _pass('3b.4', 'User B cannot self-promote to admin via UPDATE');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_4;

-- 3b.5: User A (admin) UPDATEs User B to role='admin' => rejected (no UPDATE policy in MVP)
SAVEPOINT sp_3b_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT := 0;
BEGIN
  BEGIN
    UPDATE household_members SET role = 'admin' WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN v_rows := 0;
  END;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3b.5: expected 0 rows affected (or rejection), got %', v_rows; END IF;
  PERFORM _pass('3b.5', 'Even an admin cannot promote a member via UPDATE — no UPDATE policy exists at all');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_5;

-- 3b.6: User C INSERTs User A into Household 2 => rejected
SAVEPOINT sp_3b_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO household_members (household_id, user_id, role) VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member');
    RAISE EXCEPTION 'FAIL 3b.6: User C inserted User A into Household 2';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3b.6', 'admin of Household 2 cannot INSERT an arbitrary user into their household_members');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_6;

-- 3b.7: After 3b.3's exploit sequence rolled back, User B is still plain 'member'
DO $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_role IS DISTINCT FROM 'member' THEN RAISE EXCEPTION 'FAIL 3b.7: expected role=member, got %', v_role; END IF;
  PERFORM _pass('3b.7', 'User B''s role is still member — none of the 3b tampering attempts stuck');
END $$;

-- 3b.8: User D INSERTs directly into households => rejected (no INSERT policy on households either)
SAVEPOINT sp_3b_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO households (name, created_by) VALUES ('בית פיראטי', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
    RAISE EXCEPTION 'FAIL 3b.8: User D inserted a household directly';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3b.8', 'User D cannot INSERT directly into households (no INSERT policy)');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3b_8;

-- ============================================================================
-- Group 3c — create_household() (full, non-negotiable)
-- ============================================================================

-- 3c.1 + 3c.7: happy path, and the creator's role is admin
SAVEPOINT sp_3c_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT create_household('בית חדש') INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE OR v_result->>'household_id' IS NULL THEN
    RAISE EXCEPTION 'FAIL 3c.1: expected {ok:true, household_id:<uuid>}, got %', v_result;
  END IF;
  PERFORM _pass('3c.1', 'create_household succeeds for an unaffiliated user, household + admin membership both created');

  PERFORM 1; -- keep household_id result for the next block via a temp table
  CREATE TEMP TABLE IF NOT EXISTS _sp_3c_1_result (household_id UUID);
  DELETE FROM _sp_3c_1_result;
  INSERT INTO _sp_3c_1_result VALUES ((v_result->>'household_id')::uuid);
END $$;
RESET role;
DO $$
DECLARE v_household_id UUID; v_role TEXT;
BEGIN
  SELECT household_id INTO v_household_id FROM _sp_3c_1_result;
  SELECT role INTO v_role FROM household_members WHERE household_id = v_household_id AND user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'FAIL 3c.7: expected creator role=admin, got %', v_role;
  END IF;
  PERFORM _pass('3c.7', 'the creator''s role after create_household is admin');
END $$;
ROLLBACK TO SAVEPOINT sp_3c_1;

-- 3c.2: caller is anon => EXECUTE denied
SAVEPOINT sp_3c_2;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM create_household('לא רלוונטי');
    RAISE EXCEPTION 'FAIL 3c.2: anon was able to call create_household';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('3c.2', 'anon cannot EXECUTE create_household');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3c_2;

-- 3c.3: User A (already in Household 1) calls it => already_in_household, no household created
SAVEPOINT sp_3c_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_count INT;
BEGIN
  SELECT create_household('בית כפול') INTO v_result;
  IF v_result <> '{"ok": false, "error": "already_in_household"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 3c.3: expected already_in_household, got %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM households WHERE name = 'בית כפול';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 3c.3: a household was created despite already_in_household, count=%', v_count; END IF;
  PERFORM _pass('3c.3', 'a user already in a household cannot create a second one, and none is created');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3c_3;

-- 3c.4: empty / whitespace-only name => invalid_name
SAVEPOINT sp_3c_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT create_household('') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_name"}'::jsonb THEN RAISE EXCEPTION 'FAIL 3c.4: empty name, got %', v_result; END IF;
  SELECT create_household('   ') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_name"}'::jsonb THEN RAISE EXCEPTION 'FAIL 3c.4: whitespace-only name, got %', v_result; END IF;
  PERFORM _pass('3c.4', 'empty or whitespace-only name => invalid_name');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3c_4;

-- 3c.5: name over 100 characters => invalid_name
SAVEPOINT sp_3c_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT create_household(repeat('א', 101)) INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_name"}'::jsonb THEN RAISE EXCEPTION 'FAIL 3c.5: 101-char name, got %', v_result; END IF;
  PERFORM _pass('3c.5', 'name over 100 characters => invalid_name');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3c_5;

-- 3c.6: force the membership INSERT to fail => no orphaned households row
SAVEPOINT sp_3c_6;
CREATE OR REPLACE FUNCTION _test_force_failure() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'test-forced-failure-3c6'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER _test_block_membership_insert BEFORE INSERT ON household_members
  FOR EACH ROW EXECUTE FUNCTION _test_force_failure();

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM create_household('בדיקת אטומיות 3c6');
    RAISE EXCEPTION 'FAIL 3c.6: create_household did not raise despite the forced trigger failure';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'test-forced-failure-3c6' THEN
        RAISE EXCEPTION 'FAIL 3c.6: unexpected error: %', SQLERRM;
      END IF;
  END;
END $$;
RESET role;
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM households WHERE name = 'בדיקת אטומיות 3c6';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 3c.6: orphaned household row found after forced failure, count=%', v_count; END IF;
  PERFORM _pass('3c.6', 'forcing the membership INSERT to fail leaves no orphaned households row (atomicity)');
END $$;
ROLLBACK TO SAVEPOINT sp_3c_6;

-- ============================================================================
-- Group 5 — accept_invitation() hardening (full, non-negotiable)
-- ============================================================================

-- 5.1: fixed search_path
DO $$
DECLARE v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config FROM pg_proc WHERE proname = 'accept_invitation' AND pronamespace = 'public'::regnamespace;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION 'FAIL 5.1: accept_invitation search_path not fixed, got %', v_config;
  END IF;
  PERFORM _pass('5.1', 'accept_invitation has a fixed search_path');
END $$;

-- 5.2: requires auth — call with no sub claim
SAVEPOINT sp_5_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF v_result <> '{"ok": false, "error": "unauthenticated"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5.2: expected unauthenticated, got %', v_result;
  END IF;
  PERFORM _pass('5.2', 'a call with no sub claim is rejected as unauthenticated');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_2;

-- 5.3: valid-token-shape check — nonexistent token
SAVEPOINT sp_5_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-does-not-exist') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_invitation"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5.3: expected invalid_invitation, got %', v_result;
  END IF;
  PERFORM _pass('5.3', 'a nonexistent token => invalid_invitation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_3;

-- 5.4: no replay — same token, two different eligible users, second call fails
SAVEPOINT sp_5_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 5.4: first (eligible) call should succeed, got %', v_result; END IF;
END $$;
RESET role;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_invitation"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5.4: replaying an already-consumed token should return invalid_invitation, got %', v_result;
  END IF;
  PERFORM _pass('5.4', 'no replay: a second call with an already-consumed token is rejected');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_4;

-- 5.5: status — cancelled invitation
SAVEPOINT sp_5_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-cancelled') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_invitation"}'::jsonb THEN RAISE EXCEPTION 'FAIL 5.5: got %', v_result; END IF;
  PERFORM _pass('5.5', 'a cancelled invitation => invalid_invitation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_5;

-- 5.6: expiry — expires_at in the past
SAVEPOINT sp_5_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-expired') INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_invitation"}'::jsonb THEN RAISE EXCEPTION 'FAIL 5.6: got %', v_result; END IF;
  PERFORM _pass('5.6', 'an expired invitation => invalid_invitation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_6;

-- 5.7: no duplicate membership — member of H1 calls with an H1 token
SAVEPOINT sp_5_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_count INT;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF v_result <> jsonb_build_object('ok', true, 'household_id', '11111111-1111-1111-1111-111111111111', 'already_member', true) THEN
    RAISE EXCEPTION 'FAIL 5.7: expected already_member:true, got %', v_result;
  END IF;
  SELECT count(*) INTO v_count FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111';
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL 5.7: expected membership count unchanged at 2, got %', v_count; END IF;
  PERFORM _pass('5.7', 'a member re-accepting their own household''s token is idempotent, no duplicate row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_7;

-- 5.8: atomicity — force the invitation UPDATE to fail mid-function
SAVEPOINT sp_5_8;
CREATE OR REPLACE FUNCTION _test_force_failure_58() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'test-forced-failure-58'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER _test_block_invitation_update BEFORE UPDATE ON invitations
  FOR EACH ROW EXECUTE FUNCTION _test_force_failure_58();

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM accept_invitation('tok-h1-pending');
    RAISE EXCEPTION 'FAIL 5.8: accept_invitation did not raise despite the forced trigger failure';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'test-forced-failure-58' THEN RAISE EXCEPTION 'FAIL 5.8: unexpected error: %', SQLERRM; END IF;
  END;
END $$;
RESET role;
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 5.8: orphaned membership row found after forced failure, count=%', v_count; END IF;
  PERFORM _pass('5.8', 'forcing the invitation UPDATE to fail leaves no orphaned membership row (atomicity)');
END $$;
ROLLBACK TO SAVEPOINT sp_5_8;

-- 5.9: true concurrency — see the isolated section after this transaction.

-- 5.10: no information leak — nonexistent / expired / cancelled / consumed are byte-identical
SAVEPOINT sp_5_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE r_nonexistent JSONB; r_expired JSONB; r_cancelled JSONB; r_consumed JSONB;
BEGIN
  SELECT accept_invitation('tok-does-not-exist') INTO r_nonexistent;
  SELECT accept_invitation('tok-h1-expired')     INTO r_expired;
  SELECT accept_invitation('tok-h1-cancelled')   INTO r_cancelled;
  SELECT accept_invitation('tok-h1-accepted')    INTO r_consumed;
  IF NOT (r_nonexistent = r_expired AND r_expired = r_cancelled AND r_cancelled = r_consumed) THEN
    RAISE EXCEPTION 'FAIL 5.10: responses differ — nonexistent=%, expired=%, cancelled=%, consumed=%', r_nonexistent, r_expired, r_cancelled, r_consumed;
  END IF;
  IF r_nonexistent <> '{"ok": false, "error": "invalid_invitation"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5.10: unexpected response shape %', r_nonexistent;
  END IF;
  PERFORM _pass('5.10', 'nonexistent/expired/cancelled/consumed tokens produce byte-identical generic responses');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_10;

-- 5.11: no oracle — already-in-H1 user with a valid H2 token vs an invalid token
SAVEPOINT sp_5_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE r_valid JSONB; r_invalid JSONB;
BEGIN
  SELECT accept_invitation('tok-h2-pending')     INTO r_valid;
  SELECT accept_invitation('tok-does-not-exist') INTO r_invalid;
  IF r_valid <> r_invalid THEN
    RAISE EXCEPTION 'FAIL 5.11: oracle exists — valid-other-household token=%, invalid token=%', r_valid, r_invalid;
  END IF;
  IF r_valid <> '{"ok": false, "error": "already_in_household"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 5.11: expected already_in_household, got %', r_valid;
  END IF;
  PERFORM _pass('5.11', 'no oracle: a valid token for another household is indistinguishable from an invalid one');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_11;

-- 5.12: grants — authenticated only, via information_schema
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'accept_invitation' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 5.12: accept_invitation is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('5.12', 'accept_invitation grants exclude anon and PUBLIC');
END $$;

-- 5.13: grants — call as anon => EXECUTE denied
SAVEPOINT sp_5_13;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM accept_invitation('tok-h1-pending');
    RAISE EXCEPTION 'FAIL 5.13: anon was able to call accept_invitation';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('5.13', 'anon cannot EXECUTE accept_invitation');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_13;

-- 5.14: ADR-020 — already-in-H1 user with a valid H2 token => already_in_household, no membership change
SAVEPOINT sp_5_14;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h2-pending') INTO v_result;
  IF v_result <> '{"ok": false, "error": "already_in_household"}'::jsonb THEN RAISE EXCEPTION 'FAIL 5.14: got %', v_result; END IF;
END $$;
RESET role;
-- Verified as superuser, not as User B — B has no RLS visibility into
-- Household 2 at all, so checking this while still impersonating B would
-- trivially read 0 regardless of the real state and prove nothing.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM household_members WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 5.14: Household 2 membership count changed, got %', v_count; END IF;
  PERFORM _pass('5.14', 'ADR-020: a user already in a household cannot join another via a valid token');
END $$;
ROLLBACK TO SAVEPOINT sp_5_14;

-- 5.15 + 5.16: happy path, and the created membership role is always 'member'
SAVEPOINT sp_5_15;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF v_result <> jsonb_build_object('ok', true, 'household_id', '11111111-1111-1111-1111-111111111111', 'already_member', false) THEN
    RAISE EXCEPTION 'FAIL 5.15: got %', v_result;
  END IF;
  PERFORM _pass('5.15', 'User D joins Household 1 via a valid pending token');
END $$;
RESET role;
DO $$
DECLARE v_role TEXT; v_status TEXT;
BEGIN
  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_role IS DISTINCT FROM 'member' THEN RAISE EXCEPTION 'FAIL 5.16: expected role=member, got %', v_role; END IF;
  SELECT status INTO v_status FROM invitations WHERE token = 'tok-h1-pending';
  IF v_status IS DISTINCT FROM 'accepted' THEN RAISE EXCEPTION 'FAIL 5.16: invitation status not updated to accepted, got %', v_status; END IF;
  PERFORM _pass('5.16', 'a membership created by accept_invitation is always role=member, and the invitation is marked accepted');
END $$;
ROLLBACK TO SAVEPOINT sp_5_15;

-- 5.17: already-member with a stale (expired) token for their own household => still already_member:true
SAVEPOINT sp_5_17;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-expired') INTO v_result;
  IF v_result <> jsonb_build_object('ok', true, 'household_id', '11111111-1111-1111-1111-111111111111', 'already_member', true) THEN
    RAISE EXCEPTION 'FAIL 5.17: expected already_member:true even for an expired token, got %', v_result;
  END IF;
  PERFORM _pass('5.17', 'an already-member calling with an expired token for their own household still gets already_member:true');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_17;

-- 5.18: already-member acceptance does not consume the token — the next eligible user still joins
SAVEPOINT sp_5_18;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF (v_result->>'already_member')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 5.18: expected already_member:true for User B, got %', v_result; END IF;
END $$;
RESET role;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT accept_invitation('tok-h1-pending') INTO v_result;
  IF v_result <> jsonb_build_object('ok', true, 'household_id', '11111111-1111-1111-1111-111111111111', 'already_member', false) THEN
    RAISE EXCEPTION 'FAIL 5.18: expected User D to join normally afterward, got %', v_result;
  END IF;
  PERFORM _pass('5.18', 'an already-member acceptance does not consume the token — the next eligible user still joins');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_5_18;

-- ============================================================================
-- Group 6 — Structural guards (full)
-- ============================================================================

-- 6.1, 6.2: is_household_member / is_household_admin have a fixed search_path
DO $$
DECLARE v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config FROM pg_proc WHERE proname = 'is_household_member' AND pronamespace = 'public'::regnamespace;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION 'FAIL 6.1: is_household_member search_path not fixed, got %', v_config;
  END IF;
  PERFORM _pass('6.1', 'is_household_member has a fixed search_path');
END $$;

DO $$
DECLARE v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config FROM pg_proc WHERE proname = 'is_household_admin' AND pronamespace = 'public'::regnamespace;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION 'FAIL 6.2: is_household_admin search_path not fixed, got %', v_config;
  END IF;
  PERFORM _pass('6.2', 'is_household_admin has a fixed search_path');
END $$;

-- 6.3: every table in public has rowsecurity = true
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(tablename, ',') INTO v_bad FROM pg_tables WHERE schemaname = 'public' AND rowsecurity IS NOT TRUE;
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 6.3: tables without RLS enabled: %', v_bad; END IF;
  PERFORM _pass('6.3', 'every table in public has row-level security enabled');
END $$;

-- 6.4: no table in public has zero policies
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(t.tablename, ',') INTO v_bad
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = t.tablename);
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 6.4: tables with zero policies: %', v_bad; END IF;
  PERFORM _pass('6.4', 'no table in public has zero RLS policies');
END $$;

-- 6.5: every SECURITY DEFINER function in public has a search_path in proconfig.
-- Excludes: this file's own `_`-prefixed test scaffolding, and functions
-- owned by an installed extension (e.g. dblink's internal
-- dblink_connect_u) — neither is application schema, and the extension's
-- own functions are not ours to audit.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(proname, ',') INTO v_bad
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND prosecdef = TRUE
    AND proname NOT LIKE '\_%'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = pg_proc.oid AND d.deptype = 'e')
    AND (proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%'));
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 6.5: SECURITY DEFINER functions without a fixed search_path: %', v_bad; END IF;
  PERFORM _pass('6.5', 'every SECURITY DEFINER function in public has a fixed search_path');
END $$;

-- 6.6: no SECURITY DEFINER function has EXECUTE granted to anon or PUBLIC
-- (same test-scaffolding and extension-function exclusions as 6.5).
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT g.routine_name || ' -> ' || g.grantee, ', ') INTO v_bad
  FROM information_schema.role_routine_grants g
  JOIN pg_proc p ON p.proname = g.routine_name AND p.pronamespace = 'public'::regnamespace
  WHERE g.routine_schema = 'public' AND p.prosecdef = TRUE AND p.proname NOT LIKE '\_%'
    AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    AND g.grantee IN ('anon', 'PUBLIC');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 6.6: SECURITY DEFINER functions granted to anon/PUBLIC: %', v_bad; END IF;
  PERFORM _pass('6.6', 'no SECURITY DEFINER function is granted to anon or PUBLIC');
END $$;

-- 6.7: every table with a household_id column has >=1 policy referencing the helpers
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(c.table_name, ',') INTO v_bad
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.column_name = 'household_id'
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.table_name
        AND (
          COALESCE(p.qual, '') LIKE '%is_household_member%' OR COALESCE(p.qual, '') LIKE '%is_household_admin%'
          OR COALESCE(p.with_check, '') LIKE '%is_household_member%' OR COALESCE(p.with_check, '') LIKE '%is_household_admin%'
        )
    );
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL 6.7: tables with household_id but no is_household_member/is_household_admin policy: %', v_bad; END IF;
  PERFORM _pass('6.7', 'every table with a household_id column has a policy scoping it via the RLS helpers');
END $$;

-- ============================================================================
-- Summary and rollback — the database is left exactly as it was.
-- ============================================================================

DO $$
DECLARE v_total BIGINT;
BEGIN
  SELECT last_value INTO v_total FROM _test_seq;
  RAISE NOTICE '=== % tests passed (Groups 1,2,3 subset; 3b,3c,5 minus 5.9,6 in full) ===', v_total;
END $$;

ROLLBACK;

-- ============================================================================
-- Test 5.9 — true concurrency (isolated, self-cleaning, commits and cleans
-- up its own dedicated fixture; cannot live inside the block above because
-- a second real connection cannot see uncommitted data from the first).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS dblink;

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'race-1@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race 1"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'race-2@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race 2"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('99999999-9999-9999-9999-999999999999', 'בית מרוץ תחרותי', 'f0000000-0000-0000-0000-000000000001');

INSERT INTO invitations (id, household_id, invited_by, token, status, expires_at) VALUES
  ('a0000000-0000-0000-0000-000000000099', '99999999-9999-9999-9999-999999999999', 'f0000000-0000-0000-0000-000000000001', 'tok-race', 'pending', NOW() + INTERVAL '7 days');

DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
  v_member_count INT;
  v_ok_count INT;
BEGIN
  -- dblink runs server-side, inside the postgres container, so it can't
  -- reach the host-forwarded port this script was invoked with. `db` is the
  -- container's own service hostname on the Supabase-managed Docker
  -- network, resolving to an address pg_hba.conf requires scram-sha-256
  -- for — necessary because dblink refuses a superuser-initiated connection
  -- over an unauthenticated route (trust/peer), which 127.0.0.1 is here.
  PERFORM dblink_connect('conn1', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('conn2', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

  PERFORM dblink_exec('conn1', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn1', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}'$q$);
  PERFORM dblink_exec('conn2', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn2', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}'$q$);

  -- Dispatch both calls asynchronously before collecting either result, so
  -- they race on accept_invitation's FOR UPDATE row lock.
  PERFORM dblink_send_query('conn1', $q$SELECT accept_invitation('tok-race')$q$);
  PERFORM dblink_send_query('conn2', $q$SELECT accept_invitation('tok-race')$q$);

  SELECT res INTO v_r1 FROM dblink_get_result('conn1') AS t(res JSONB);
  SELECT res INTO v_r2 FROM dblink_get_result('conn2') AS t(res JSONB);
  PERFORM dblink_get_result('conn1'); -- drain end-of-results marker
  PERFORM dblink_get_result('conn2');

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  SELECT count(*) INTO v_member_count FROM household_members WHERE household_id = '99999999-9999-9999-9999-999999999999';
  SELECT (CASE WHEN (v_r1->>'ok')::boolean THEN 1 ELSE 0 END) + (CASE WHEN (v_r2->>'ok')::boolean THEN 1 ELSE 0 END) INTO v_ok_count;

  IF v_member_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5.9: expected exactly 1 membership created by the race, got % (r1=%, r2=%)', v_member_count, v_r1, v_r2;
  END IF;
  IF v_ok_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 5.9: expected exactly one of the two concurrent calls to succeed, got % successes (r1=%, r2=%)', v_ok_count, v_r1, v_r2;
  END IF;

  RAISE NOTICE 'PASS 5.9: two concurrent accept_invitation calls on the same token => exactly one membership created';
END $$;

-- Cleanup — real DELETEs, since this section committed its own fixture.
DELETE FROM household_members WHERE household_id = '99999999-9999-9999-9999-999999999999';
DELETE FROM invitations WHERE id = 'a0000000-0000-0000-0000-000000000099';
DELETE FROM households WHERE id = '99999999-9999-9999-9999-999999999999';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002');

-- ============================================================================
-- Test ADR-020-race — regression test for the advisory-lock fix in
-- create_household() / accept_invitation(). Before the fix, a single user
-- calling create_household() and accept_invitation() concurrently could
-- pass both functions' unlocked "already in a household?" checks before
-- either committed (they insert into different household_id rows, which
-- share no constrained key to contend on), ending up a member of two
-- households at once. Same isolation rationale as 5.9: needs a second real
-- connection, so it commits its own fixture and cleans up after itself.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'race-user@test.local',  crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race User"}',  NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000011', 'authenticated', 'authenticated', 'race-other@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race Other Admin"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('88888888-8888-8888-8888-888888888888', 'בית אחר למרוץ', 'f0000000-0000-0000-0000-000000000011');
INSERT INTO household_members (household_id, user_id, role) VALUES
  ('88888888-8888-8888-8888-888888888888', 'f0000000-0000-0000-0000-000000000011', 'admin');
INSERT INTO invitations (id, household_id, invited_by, token, status, expires_at) VALUES
  ('a0000000-0000-0000-0000-000000000098', '88888888-8888-8888-8888-888888888888', 'f0000000-0000-0000-0000-000000000011', 'tok-race-adr020', 'pending', NOW() + INTERVAL '7 days');

DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
  v_member_count INT;
BEGIN
  PERFORM dblink_connect('conn1', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('conn2', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

  PERFORM dblink_exec('conn1', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn1', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000010","role":"authenticated"}'$q$);
  PERFORM dblink_exec('conn2', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn2', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000010","role":"authenticated"}'$q$);
  -- Same user (...010) on both connections — racing create_household()
  -- against accept_invitation() for themselves, not two different users.

  PERFORM dblink_send_query('conn1', $q$SELECT create_household('הבית שלי במרוץ')$q$);
  PERFORM dblink_send_query('conn2', $q$SELECT accept_invitation('tok-race-adr020')$q$);

  SELECT res INTO v_r1 FROM dblink_get_result('conn1') AS t(res JSONB);
  SELECT res INTO v_r2 FROM dblink_get_result('conn2') AS t(res JSONB);
  PERFORM dblink_get_result('conn1');
  PERFORM dblink_get_result('conn2');

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  SELECT count(*) INTO v_member_count FROM household_members WHERE user_id = 'f0000000-0000-0000-0000-000000000010';

  IF v_member_count <> 1 THEN
    RAISE EXCEPTION 'FAIL ADR-020-race: expected exactly 1 household membership for the racing user, got % (r1=%, r2=%)', v_member_count, v_r1, v_r2;
  END IF;

  RAISE NOTICE 'PASS ADR-020-race: create_household() and accept_invitation() racing for the same user => exactly one membership, never two';
END $$;

-- Cleanup — real DELETEs, since this section committed its own fixture.
-- Covers both possible race outcomes: the fixed Household 88888888... (the
-- accept_invitation() target) and whatever household create_household()
-- may have created, identified by the distinctive name it was called with
-- (captured before household_members rows referencing it are removed).
DELETE FROM household_members WHERE user_id = 'f0000000-0000-0000-0000-000000000010'
  OR household_id = '88888888-8888-8888-8888-888888888888';
DELETE FROM invitations WHERE id = 'a0000000-0000-0000-0000-000000000098';
DELETE FROM households WHERE id = '88888888-8888-8888-8888-888888888888' OR name = 'הבית שלי במרוץ';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000010', 'f0000000-0000-0000-0000-000000000011');

DO $$ BEGIN RAISE NOTICE '=== ALL RLS TESTS PASSED (51 assertions: 49 in the main transaction + 5.9 + ADR-020-race) ==='; END $$;
