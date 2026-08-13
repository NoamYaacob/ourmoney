-- ============================================================================
-- OurMoney — RLS Security Test Suite (Milestone 2 / MVP-1)
-- ============================================================================
--
-- Run:
--   PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/rls_tests.sql
--
-- Coverage matches docs/PHASE_1_PLAN.md §2.5 plus the Milestone 6 (MVP-2)
-- financial-table additions. Groups 1/2/3 are now complete (the MVP-1
-- subset landed with migration 001; the remaining sub-tests, needing
-- accounts/categories/category_rules/recurring_transactions/transactions/
-- budgets/budget_allocations/savings_goals, land here with migration 002).
-- Group 4 (categories) is new in Milestone 6. Groups 3b, 3c, 5, and 6 are
-- unchanged from MVP-1 and remain implemented in full. Milestone 6 also adds:
-- the D2 cross-household FK-coherence tests, the financial visibility
-- matrix (VM.*, per the M6 plan §6a), the D6 CHECK (amount_agorot <> 0)
-- tests, the save_budget_allocations() RPC test group (RPC.*), and a
-- grant/policy parity check across all 8 new tables. Milestone 7 adds
-- DB.PARITY.*/RECURRING.*/RECURRING.SKIP.*/RECURRING.ATOMICITY/
-- SAVINGS.TRIGGER.* for migration 003. Milestone 9 adds Group 7
-- (delete_own_account(), migration 004): search_path/grants, admin
-- succession, sole-member household cascade, attribution nulling vs.
-- shared-data preservation, the D2-widening regression it introduces and
-- fixes in the same migration, idempotency, and the DELETE_ACCOUNT.CONCURRENT
-- true-concurrency test (isolated section, same reason as 5.9 below).
-- Migration 005 adds Group 8 (leave_household()): the same admin-succession
-- and sole-member-cascade coverage as Group 7, extended to the caller's own
-- account surviving in every branch, plus the LEAVE.CONCURRENT
-- true-concurrency test (isolated section, same reason as 5.9/
-- DELETE_ACCOUNT.CONCURRENT).
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

-- ----------------------------------------------------------------------------
-- Milestone 6 (MVP-2) fixtures — real rows in BOTH households for every
-- financial table, per the M6 plan's explicit non-vacuous-test requirement.
-- A Household-2 row of every type is required for every "User A SELECTs
-- Household 2's X => 0 rows" assertion to mean anything; without one, such
-- an assertion passes identically whether RLS is correct or entirely absent.
-- ----------------------------------------------------------------------------

INSERT INTO accounts (id, household_id, owner_id, name, type) VALUES
  ('5a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', NULL, 'חשבון עו״ש בית 1', 'checking'),
  ('5a000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', NULL, 'חשבון עו״ש בית 2', 'checking');

INSERT INTO categories (id, household_id, name_he, is_system) VALUES
  ('5c000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'קטגוריה מותאמת בית 1', FALSE),
  ('5c000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'קטגוריה מותאמת בית 2', FALSE);

INSERT INTO category_rules (id, household_id, category_id, field, operator, value) VALUES
  ('5d000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5c000000-0000-0000-0000-000000000001', 'description', 'contains', 'סופר'),
  ('5d000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5c000000-0000-0000-0000-000000000002', 'description', 'contains', 'סופר');

INSERT INTO recurring_transactions (id, household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by) VALUES
  ('5e000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -5000, 'הו״ק בית 1', 'monthly', '2026-09-01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('5e000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5a000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', -5000, 'הו״ק בית 2', 'monthly', '2026-09-01', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Household 1: one shared transaction created by A, one personal
-- transaction created by A (the two visibility-matrix cells the M6 plan §6a
-- requires tested) — Household 2: one transaction by C.
INSERT INTO transactions (id, household_id, account_id, category_id, amount_agorot, description, txn_date, is_shared, payer_id, created_by) VALUES
  ('5f000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -2000, 'קניה משותפת בית 1', '2026-08-05', TRUE,  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('5f000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1500, 'קניה אישית בית 1',  '2026-08-06', FALSE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('5f000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '5a000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', -3000, 'קניה בית 2',        '2026-08-05', TRUE,  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

INSERT INTO budgets (id, household_id, period_start, period_end) VALUES
  ('5b000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-08-01', '2026-08-31'),
  ('5b000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '2026-08-01', '2026-08-31');

INSERT INTO budget_allocations (id, household_id, budget_id, category_id, amount_agorot) VALUES
  ('5b100000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 10000),
  ('5b100000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5b000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', 10000);

INSERT INTO savings_goals (id, household_id, account_id, name, target_agorot, created_by) VALUES
  ('59000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', 'יעד חיסכון בית 1', 100000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('59000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5a000000-0000-0000-0000-000000000002', 'יעד חיסכון בית 2', 100000, 'cccccccc-cccc-cccc-cccc-cccccccccccc');

DO $$ BEGIN RAISE NOTICE '=== fixtures loaded (incl. Milestone 6 financial fixtures, both households) ==='; END $$;

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
-- ============================================================================
-- Milestone 6 (MVP-2) — financial schema tests. Fills the Group 1/2/3
-- sub-tests reserved for financial tables in MVP-1 (see this file's header),
-- adds Group 4 (categories), the D2 cross-household FK-coherence tests, the
-- financial visibility matrix (M6 plan §6a), the D6 CHECK constraint tests,
-- and the save_budget_allocations() RPC test group.
-- ============================================================================

-- Group 1 — Cross-household isolation (1.1-1.11): User A (Household 1)
-- against Household 2's financial rows.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM transactions WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.1: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.1', 'User A cannot SELECT Household 2 transactions');
END $$;
RESET role;

SAVEPOINT sp_1_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('22222222-2222-2222-2222-222222222222', '5a000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000002', -100, 'ניסיון חדירה', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL 1.2: User A inserted a transaction into Household 2';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('1.2', 'User A cannot INSERT a Household 2 transaction');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_1_2;

SAVEPOINT sp_1_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT := 0;
BEGIN
  UPDATE transactions SET note = 'עודכן בזדון' WHERE id = '5f000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 1.3: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('1.3', 'User A cannot UPDATE a Household 2 transaction');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_1_3;

SAVEPOINT sp_1_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM transactions WHERE id = '5f000000-0000-0000-0000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 1.4: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('1.4', 'User A cannot DELETE a Household 2 transaction (not even admin of H1 helps — not a member of H2 at all)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_1_4;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM accounts WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.5: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.5', 'User A cannot SELECT Household 2 accounts');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM budgets WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.6: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.6', 'User A cannot SELECT Household 2 budgets');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM budget_allocations WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.7: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.7', 'User A cannot SELECT Household 2 budget_allocations');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  -- Household 2's CUSTOM category only — system categories are legitimately visible (Group 4).
  SELECT count(*) INTO v_count FROM categories WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.8: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.8', 'User A cannot SELECT Household 2''s custom categories');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM category_rules WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.9: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.9', 'User A cannot SELECT Household 2 category_rules');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM recurring_transactions WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.10: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.10', 'User A cannot SELECT Household 2 recurring_transactions');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM savings_goals WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 1.11: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('1.11', 'User A cannot SELECT Household 2 savings_goals');
END $$;
RESET role;

-- Group 2 additions (2.2-2.5, 2.7): User D, no household.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM transactions;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.2: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.2', 'User D (no household) SELECTs transactions => 0 rows');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM accounts;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.3: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.3', 'User D (no household) SELECTs accounts => 0 rows');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM budgets;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.4: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.4', 'User D (no household) SELECTs budgets => 0 rows');
END $$;
RESET role;

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM savings_goals;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 2.5: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('2.5', 'User D (no household) SELECTs savings_goals => 0 rows');
END $$;
RESET role;

SAVEPOINT sp_2_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -100, 'לא רלוונטי', '2026-08-05', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
    RAISE EXCEPTION 'FAIL 2.7: User D inserted into Household 1 transactions';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('2.7', 'User D (no household) cannot INSERT into any household''s transactions');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_2_7;

-- Group 3 additions (3.1, 3.2, 3.5, 3.6): User B (member, not admin) of Household 1.
SAVEPOINT sp_3_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM transactions WHERE id = '5f000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3.1: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('3.1', 'member cannot DELETE a Household 1 transaction (admin only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_1;

SAVEPOINT sp_3_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM accounts WHERE id = '5a000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3.2: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('3.2', 'member cannot DELETE a Household 1 account (admin only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_2;

SAVEPOINT sp_3_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  DELETE FROM categories WHERE id = '5c000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 3.5: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('3.5', 'member cannot DELETE a Household 1 custom category (admin only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_5;

SAVEPOINT sp_3_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -300, 'תנועה של בן/בת הזוג', '2026-08-07', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL 3.6: expected 1 row inserted, got %', v_rows; END IF;
  PERFORM _pass('3.6', 'member CAN INSERT a Household 1 transaction');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_3_6;

-- ============================================================================
-- Group 4 — Categories
-- ============================================================================

DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  -- User D belongs to no household — proves system-category visibility is
  -- not household-membership-gated at all.
  SELECT count(*) INTO v_count FROM categories WHERE is_system = TRUE;
  IF v_count <> 23 THEN RAISE EXCEPTION 'FAIL 4.1: expected 23 system categories visible, got %', v_count; END IF;
  PERFORM _pass('4.1', 'any authenticated user (even with no household) can SELECT all 23 system categories');
END $$;
RESET role;

SAVEPOINT sp_4_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO categories (household_id, name_he) VALUES (NULL, 'קטגוריית מערכת מזויפת');
    RAISE EXCEPTION 'FAIL 4.2: User A created a category with household_id=NULL';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('4.2', 'a household member cannot create a category with household_id=NULL');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_4_2;

SAVEPOINT sp_4_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO categories (household_id, name_he, is_system) VALUES ('11111111-1111-1111-1111-111111111111', 'קטגוריה מזויפת', TRUE);
    RAISE EXCEPTION 'FAIL 4.3: User A created a category with is_system=TRUE';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('4.3', 'a household member cannot create a category with is_system=TRUE');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_4_3;

SAVEPOINT sp_4_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT := 0; v_system_id UUID;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  UPDATE categories SET name_he = 'שונה בזדון' WHERE id = v_system_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 4.4: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('4.4', 'a household member cannot UPDATE a system category');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_4_4;

SAVEPOINT sp_4_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_system_id UUID;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  DELETE FROM categories WHERE id = v_system_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN RAISE EXCEPTION 'FAIL 4.5: expected 0 rows affected, got %', v_rows; END IF;
  PERFORM _pass('4.5', 'a household member (even admin) cannot DELETE a system category');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_4_5;

SAVEPOINT sp_4_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO categories (household_id, name_he) VALUES ('11111111-1111-1111-1111-111111111111', 'קטגוריה חדשה בית 1');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL 4.6: expected 1 row inserted, got %', v_rows; END IF;
  PERFORM _pass('4.6', 'a household member can create a custom category for their own household');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_4_6;

-- ============================================================================
-- D2 — cross-household FK coherence (the widened WITH CHECK clauses)
-- ============================================================================

-- D2.1: transactions.account_id pointing at Household 2's account => rejected
SAVEPOINT sp_d2_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001', -100, 'חשבון חוצה בית', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.1: transaction with a cross-household account_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.1', 'transactions.account_id pointing at another household''s account is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_1;

-- D2.2: transactions.category_id pointing at Household 2's custom category => rejected
SAVEPOINT sp_d2_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', -100, 'קטגוריה חוצה בית', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.2: transaction with a cross-household category_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.2', 'transactions.category_id pointing at another household''s custom category is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_2;

-- D2.3 (positive): transactions.category_id pointing at a SYSTEM category => succeeds
SAVEPOINT sp_d2_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_system_id UUID;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', v_system_id, -100, 'קטגורית מערכת', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.3: expected 1 row inserted referencing a system category, got %', v_rows; END IF;
  PERFORM _pass('D2.3', 'a transaction referencing a SYSTEM category still succeeds (the fix does not break the primary MVP-2 categorization scheme)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_3;

-- D2.4: transactions.recurring_id pointing at Household 2's recurring row => rejected
SAVEPOINT sp_d2_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, recurring_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000002', -100, 'הו״ק חוצה בית', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.4: transaction with a cross-household recurring_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.4', 'transactions.recurring_id pointing at another household''s recurring row is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_4;

-- D2.5: transactions.payer_id set to a user outside the household (User C, Household 2) => rejected
SAVEPOINT sp_d2_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, payer_id, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -100, 'שיוך תשלום כוזב', '2026-08-05', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.5: transaction with payer_id outside the household was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.5', 'transactions.payer_id cannot be set to a user outside the household');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_5;

-- D2.6: transactions.created_by set to a different user on INSERT => rejected (must equal auth.uid())
SAVEPOINT sp_d2_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -100, 'יצירה כוזבת', '2026-08-05', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'FAIL D2.6: User A inserted a transaction with created_by set to User B';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.6', 'INSERT requires created_by = auth.uid() — cannot attribute a new row to someone else');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_6;

-- D2.7 (co-editing, VM.3): User B UPDATEs the Household 1 transaction created
-- by User A without touching created_by => succeeds (financial visibility
-- matrix: any household member may edit any transaction).
SAVEPOINT sp_d2_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE transactions SET note = 'ערוך על ידי בן/בת הזוג' WHERE id = '5f000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.7: expected 1 row updated, got %', v_rows; END IF;
  PERFORM _pass('D2.7', 'User B can UPDATE a Household 1 transaction created by User A (co-editing, not creator-only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_7;

-- D2.8: User B UPDATEs the same transaction, reattributing created_by to
-- User C (outside the household) => rejected.
SAVEPOINT sp_d2_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    UPDATE transactions SET created_by = 'cccccccc-cccc-cccc-cccc-cccccccccccc' WHERE id = '5f000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL D2.8: User B reattributed created_by to a user outside the household';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.8', 'UPDATE cannot reattribute created_by to a user outside the household');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_8;

-- D2.9 (positive): User B UPDATEs the same transaction, reattributing
-- created_by to themselves (a current household member) => succeeds.
SAVEPOINT sp_d2_9;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE transactions SET created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE id = '5f000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.9: expected 1 row updated, got %', v_rows; END IF;
  PERFORM _pass('D2.9', 'UPDATE can reattribute created_by to any CURRENT household member (locks in the intended scope)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_9;

-- D2.10: category_rules.category_id pointing at Household 2's custom category => rejected
SAVEPOINT sp_d2_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO category_rules (household_id, category_id, field, operator, value)
    VALUES ('11111111-1111-1111-1111-111111111111', '5c000000-0000-0000-0000-000000000002', 'description', 'contains', 'x');
    RAISE EXCEPTION 'FAIL D2.10: category_rule referencing another household''s category was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.10', 'category_rules.category_id pointing at another household''s category is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_10;

-- D2.11 (positive): category_rules.category_id pointing at a SYSTEM category => succeeds
SAVEPOINT sp_d2_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_system_id UUID;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  INSERT INTO category_rules (household_id, category_id, field, operator, value)
  VALUES ('11111111-1111-1111-1111-111111111111', v_system_id, 'description', 'contains', 'x');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.11: expected 1 row inserted referencing a system category, got %', v_rows; END IF;
  PERFORM _pass('D2.11', 'a category_rule referencing a SYSTEM category still succeeds');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_11;

-- D2.12: recurring_transactions.account_id pointing at Household 2's account => rejected
SAVEPOINT sp_d2_12;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000002', '5c000000-0000-0000-0000-000000000001', -100, 'הו״ק חוצה בית', 'monthly', '2026-09-01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.12: recurring_transactions with a cross-household account_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.12', 'recurring_transactions.account_id pointing at another household''s account is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_12;

-- D2.13: recurring_transactions.created_by set to a different user on INSERT => rejected
SAVEPOINT sp_d2_13;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -100, 'יצירה כוזבת', 'monthly', '2026-09-01', 'cccccccc-cccc-cccc-cccc-cccccccccccc');
    RAISE EXCEPTION 'FAIL D2.13: recurring_transactions inserted with created_by set to an outside user';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.13', 'recurring_transactions INSERT requires created_by = auth.uid()');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_13;

-- D2.14: budget_allocations.category_id pointing at Household 2's custom category => rejected
SAVEPOINT sp_d2_14;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO budget_allocations (household_id, budget_id, category_id, amount_agorot)
    VALUES ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000002', 5000);
    RAISE EXCEPTION 'FAIL D2.14: budget_allocations referencing another household''s category was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.14', 'budget_allocations.category_id pointing at another household''s category is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_14;

-- D2.15 (positive): budget_allocations.category_id pointing at a SYSTEM category => succeeds
SAVEPOINT sp_d2_15;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_system_id UUID;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  INSERT INTO budget_allocations (household_id, budget_id, category_id, amount_agorot)
  VALUES ('11111111-1111-1111-1111-111111111111', '5b000000-0000-0000-0000-000000000001', v_system_id, 5000);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.15: expected 1 row inserted allocating to a system category, got %', v_rows; END IF;
  PERFORM _pass('D2.15', 'a budget_allocation referencing a SYSTEM category still succeeds');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_15;

-- D2.16: accounts.owner_id set to a user outside the household => rejected
SAVEPOINT sp_d2_16;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO accounts (household_id, owner_id, name, type)
    VALUES ('11111111-1111-1111-1111-111111111111', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'חשבון בבעלות זרה', 'cash');
    RAISE EXCEPTION 'FAIL D2.16: account with owner_id outside the household was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.16', 'accounts.owner_id cannot be set to a user outside the household');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_16;

-- D2.17 (positive): accounts.owner_id set to a fellow household member => succeeds
SAVEPOINT sp_d2_17;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO accounts (household_id, owner_id, name, type)
  VALUES ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'חשבון אישי', 'cash');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D2.17: expected 1 row inserted with an in-household owner_id, got %', v_rows; END IF;
  PERFORM _pass('D2.17', 'accounts.owner_id set to a fellow household member succeeds');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_17;

-- D2.18: categories.parent_id pointing at Household 2's custom category => rejected
SAVEPOINT sp_d2_18;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO categories (household_id, name_he, parent_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'תת-קטגוריה', '5c000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'FAIL D2.18: category with parent_id pointing at another household was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.18', 'categories.parent_id pointing at another household''s category is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_18;

-- D2.19: savings_goals.account_id pointing at Household 2's account => rejected
SAVEPOINT sp_d2_19;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO savings_goals (household_id, account_id, name, target_agorot, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000002', 'יעד עם חשבון זר', 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D2.19: savings_goal with account_id pointing at another household was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('D2.19', 'savings_goals.account_id pointing at another household''s account is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d2_19;

-- ============================================================================
-- Financial visibility matrix (M6 plan §6a) — is_shared/created_by/payer_id
-- are attribution/display only, never a read authorization predicate.
-- ============================================================================

-- VM.1: User B (partner) SELECTs the Household 1 SHARED transaction created by A => visible.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM transactions WHERE id = '5f000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL VM.1: expected the shared transaction to be visible to User B, got % rows', v_count; END IF;
  PERFORM _pass('VM.1', 'User B can SELECT a shared Household 1 transaction created by User A');
END $$;
RESET role;

-- VM.2 (the Monarch-failure-mode test): User B SELECTs the Household 1
-- PERSONAL transaction created by A => STILL visible. is_shared=false is
-- budget attribution only, never a visibility flag.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM transactions WHERE id = '5f000000-0000-0000-0000-000000000002';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL VM.2: expected the PERSONAL transaction to be visible to User B, got % rows — is_shared=false must never gate visibility', v_count; END IF;
  PERFORM _pass('VM.2', 'User B can SELECT User A''s PERSONAL (is_shared=false) transaction — every member sees every row in MVP');
END $$;
RESET role;

-- VM.5: after User B is removed from household_members, User B loses SELECT
-- access to Household 1's financial data (not just household_members
-- itself) — proves the visibility loss is structural (RLS), independent of
-- any client-side cache behavior.
SAVEPOINT sp_vm_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
END $$;
RESET role;
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM transactions WHERE household_id = '11111111-1111-1111-1111-111111111111';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL VM.5: expected 0 rows after removal, got %', v_count; END IF;
  PERFORM _pass('VM.5', 'a removed member loses SELECT access to the household''s financial data (D9 — fails closed at the RLS layer, independent of client cache)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_vm_5;

-- ============================================================================
-- D6 — CHECK (amount_agorot <> 0)
-- ============================================================================

SAVEPOINT sp_d6_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 0, 'תנועת אפס', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D6.1: a zero-agorot transaction was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM _pass('D6.1', 'a zero-agorot transaction is rejected by CHECK (amount_agorot <> 0)');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d6_1;

SAVEPOINT sp_d6_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO transactions (household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 5000, 'הכנסה', '2026-08-05', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL D6.2: a valid positive (income) transaction was rejected'; END IF;
  PERFORM _pass('D6.2', 'a positive (income) non-zero transaction is accepted');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d6_2;

SAVEPOINT sp_d6_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', 0, 'הו״ק אפס', 'monthly', '2026-09-01', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL D6.3: a zero-agorot recurring_transactions row was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM _pass('D6.3', 'a zero-agorot recurring_transactions row is rejected by CHECK (amount_agorot <> 0)');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_d6_3;

-- ============================================================================
-- save_budget_allocations() RPC (D3) — a fresh period (2026-09) so these
-- tests don't interact with the fixture budget already seeded for 2026-08.
-- ============================================================================

-- RPC.1: happy path — User A saves an allocation for Household 1's custom category.
SAVEPOINT sp_rpc_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_budget_id UUID; v_alloc_count INT; v_alloc_amount BIGINT;
BEGIN
  SELECT save_budget_allocations('2026-09-01'::date, jsonb_build_array(
    jsonb_build_object('categoryId', '5c000000-0000-0000-0000-000000000001', 'amountAgorot', '15000')
  )) INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL RPC.1: expected ok:true, got %', v_result; END IF;
  v_budget_id := (v_result->>'budget_id')::uuid;
  SELECT count(*), max(amount_agorot) INTO v_alloc_count, v_alloc_amount FROM budget_allocations WHERE budget_id = v_budget_id;
  IF v_alloc_count <> 1 OR v_alloc_amount <> 15000 THEN
    RAISE EXCEPTION 'FAIL RPC.1: expected exactly 1 allocation of 15000, got count=% amount=%', v_alloc_count, v_alloc_amount;
  END IF;
  PERFORM _pass('RPC.1', 'save_budget_allocations happy path creates the budget and allocation rows');
END $$;
RESET role;

-- RPC.4 continued in the same savepoint scope: idempotent re-save with the
-- identical payload leaves exactly one budget and one allocation row.
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_budget_count INT; v_alloc_count INT;
BEGIN
  PERFORM save_budget_allocations('2026-09-01'::date, jsonb_build_array(
    jsonb_build_object('categoryId', '5c000000-0000-0000-0000-000000000001', 'amountAgorot', '15000')
  ));
  SELECT count(*) INTO v_budget_count FROM budgets WHERE household_id = '11111111-1111-1111-1111-111111111111' AND period_start = '2026-09-01';
  SELECT count(*) INTO v_alloc_count FROM budget_allocations ba JOIN budgets b ON b.id = ba.budget_id WHERE b.household_id = '11111111-1111-1111-1111-111111111111' AND b.period_start = '2026-09-01';
  IF v_budget_count <> 1 THEN RAISE EXCEPTION 'FAIL RPC.4: expected exactly 1 budget row after re-save, got %', v_budget_count; END IF;
  IF v_alloc_count <> 1 THEN RAISE EXCEPTION 'FAIL RPC.4: expected exactly 1 allocation row after re-save, got %', v_alloc_count; END IF;
  PERFORM _pass('RPC.4', 'calling save_budget_allocations twice with the same payload is idempotent — no duplicate budget/allocation rows');
END $$;
RESET role;

-- RPC.5: true replace — saving with only the SYSTEM category this time
-- removes the previously-saved custom-category allocation.
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_system_id UUID; v_old_category_count INT; v_new_category_count INT;
BEGIN
  SELECT id INTO v_system_id FROM categories WHERE is_system = TRUE LIMIT 1;
  SELECT save_budget_allocations('2026-09-01'::date, jsonb_build_array(
    jsonb_build_object('categoryId', v_system_id, 'amountAgorot', '20000')
  )) INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL RPC.5: expected ok:true, got %', v_result; END IF;

  SELECT count(*) INTO v_old_category_count FROM budget_allocations ba JOIN budgets b ON b.id = ba.budget_id
    WHERE b.household_id = '11111111-1111-1111-1111-111111111111' AND b.period_start = '2026-09-01' AND ba.category_id = '5c000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_new_category_count FROM budget_allocations ba JOIN budgets b ON b.id = ba.budget_id
    WHERE b.household_id = '11111111-1111-1111-1111-111111111111' AND b.period_start = '2026-09-01' AND ba.category_id = v_system_id;

  IF v_old_category_count <> 0 THEN RAISE EXCEPTION 'FAIL RPC.5: expected the prior custom-category allocation to be deleted (true replace), got % rows', v_old_category_count; END IF;
  IF v_new_category_count <> 1 THEN RAISE EXCEPTION 'FAIL RPC.5: expected the new system-category allocation to exist, got % rows', v_new_category_count; END IF;
  PERFORM _pass('RPC.5', 'save_budget_allocations uses TRUE REPLACE semantics — an omitted category''s prior allocation is deleted, not left stale');
END $$;
RESET role;

-- RPC.6: empty payload clears the whole month.
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_alloc_count INT;
BEGIN
  SELECT save_budget_allocations('2026-09-01'::date, '[]'::jsonb) INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL RPC.6: expected ok:true, got %', v_result; END IF;
  SELECT count(*) INTO v_alloc_count FROM budget_allocations ba JOIN budgets b ON b.id = ba.budget_id
    WHERE b.household_id = '11111111-1111-1111-1111-111111111111' AND b.period_start = '2026-09-01';
  IF v_alloc_count <> 0 THEN RAISE EXCEPTION 'FAIL RPC.6: expected 0 allocations after an empty-array save, got %', v_alloc_count; END IF;
  PERFORM _pass('RPC.6', 'an empty-array payload legitimately clears every allocation for the month (true replace, not upsert-only)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_1;

-- RPC.2: User D (no household) => {ok:false, error:'no_household'}, no budget row created.
SAVEPOINT sp_rpc_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT save_budget_allocations('2026-09-01'::date, '[]'::jsonb) INTO v_result;
  IF v_result <> '{"ok": false, "error": "no_household"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL RPC.2: expected no_household, got %', v_result;
  END IF;
  PERFORM _pass('RPC.2', 'a caller with no household gets {ok:false, error:no_household}, not an unhandled NOT NULL violation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_2;

-- RPC.3: cross-household category_id in the payload is rejected by the
-- underlying RLS policy (SECURITY INVOKER — no bypass), not by function logic.
SAVEPOINT sp_rpc_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    PERFORM save_budget_allocations('2026-09-01'::date, jsonb_build_array(
      jsonb_build_object('categoryId', '5c000000-0000-0000-0000-000000000002', 'amountAgorot', '1000')
    ));
    RAISE EXCEPTION 'FAIL RPC.3: a cross-household category_id in the payload was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('RPC.3', 'save_budget_allocations does not reopen D2 — a cross-household category_id is rejected by the underlying RLS policy');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_3;

-- RPC.9: invalid (non-integer) amount input is rejected cleanly.
SAVEPOINT sp_rpc_9;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT save_budget_allocations('2026-09-01'::date, jsonb_build_array(
    jsonb_build_object('categoryId', '5c000000-0000-0000-0000-000000000001', 'amountAgorot', '12.5')
  )) INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_allocation"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL RPC.9: expected invalid_allocation for a non-integer amount, got %', v_result;
  END IF;
  PERFORM _pass('RPC.9', 'a non-integer amountAgorot ("12.5") is rejected as invalid_allocation, never rounded through a numeric cast');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_9;

-- RPC.10: zero/negative amount is rejected.
SAVEPOINT sp_rpc_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT save_budget_allocations('2026-09-01'::date, jsonb_build_array(
    jsonb_build_object('categoryId', '5c000000-0000-0000-0000-000000000001', 'amountAgorot', '0')
  )) INTO v_result;
  IF v_result <> '{"ok": false, "error": "invalid_allocation"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL RPC.10: expected invalid_allocation for a zero amount, got %', v_result;
  END IF;
  PERFORM _pass('RPC.10', 'a zero amountAgorot is rejected as invalid_allocation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_10;

-- RPC.7: grants — authenticated only, via information_schema.
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'save_budget_allocations' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RPC.7: save_budget_allocations is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('RPC.7', 'save_budget_allocations grants exclude anon and PUBLIC');
END $$;

-- RPC.8: grants — call as anon => EXECUTE denied.
SAVEPOINT sp_rpc_8;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM save_budget_allocations('2026-09-01'::date, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL RPC.8: anon was able to call save_budget_allocations';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('RPC.8', 'anon cannot EXECUTE save_budget_allocations');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_rpc_8;

-- ============================================================================
-- Grant/policy parity — structural guard (ADR-023), not an enumerated list.
-- Iterates every base table actually present in the public schema, so a
-- future migration that forgets its own REVOKE ALL / GRANT pair is caught
-- automatically rather than only tables named here (database-security-
-- reviewer LOW finding on the prior, table-name-enumerated version of this
-- test, folded into a HIGH/MEDIUM finding: the enumerated version also never
-- checked migration 001's 4 tables at all, and never checked `authenticated`
-- for TRUNCATE/REFERENCES/TRIGGER — only for a SELECT grant).
--
-- Asserts, for every public-schema base table:
--   (a) `anon` holds zero privileges of any kind. TRUNCATE/REFERENCES/
--       TRIGGER are NOT mediated by RLS at all, so a residual anon grant of
--       any privilege type — not just SELECT/INSERT/UPDATE/DELETE — defeats
--       fail-closed/least-privilege even though PostgREST never exposes a
--       TRUNCATE endpoint. This is the exact defect a live `supabase db
--       reset` found: every table had anon TRUNCATE/REFERENCES/TRIGGER with
--       no anon DML, because Supabase's local Postgres instance grants
--       those three privileges directly to anon/authenticated by default,
--       independent of config.toml's `auto_expose_new_tables`.
--   (b) `authenticated` holds no TRUNCATE/REFERENCES/TRIGGER either — this
--       project's app code never needs them, so least-privilege applies to
--       authenticated too, not just anon.
--   (c) `authenticated` has at least a SELECT grant — every table in this
--       schema is read through the app.
-- ============================================================================

DO $$
DECLARE v_table TEXT; v_bad TEXT := '';
BEGIN
  FOR v_table IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_table AND grantee = 'anon'
    ) THEN
      v_bad := v_bad || v_table || ' has an anon grant; ';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_table AND grantee = 'authenticated'
        AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
    ) THEN
      v_bad := v_bad || v_table || ' grants authenticated TRUNCATE/REFERENCES/TRIGGER; ';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = v_table AND grantee = 'authenticated' AND privilege_type = 'SELECT'
    ) THEN
      v_bad := v_bad || v_table || ' is missing a SELECT grant for authenticated; ';
    END IF;
  END LOOP;
  IF v_bad <> '' THEN RAISE EXCEPTION 'FAIL grants-parity: %', v_bad; END IF;
  PERFORM _pass('grants-parity', 'every public-schema table has an authenticated SELECT grant, no anon grant of any kind, and no authenticated TRUNCATE/REFERENCES/TRIGGER grant');
END $$;

-- ============================================================================
-- Milestone 7 — DB.PARITY: advance_recurring_due_date() SQL parity with the
-- TypeScript reference implementation (features/recurring/lib/
-- recurringDueDate.ts). Same fixture table, both places.
-- ============================================================================

DO $$
BEGIN
  IF advance_recurring_due_date('2026-01-31'::date, 'monthly', 31) <> '2026-02-28'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.1: expected 2026-02-28';
  END IF;
  PERFORM _pass('DB.PARITY.1', 'monthly 31st clamps to Feb 28 in a non-leap year');
END $$;

DO $$
BEGIN
  IF advance_recurring_due_date('2028-01-31'::date, 'monthly', 31) <> '2028-02-29'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.2: expected 2028-02-29';
  END IF;
  PERFORM _pass('DB.PARITY.2', 'monthly 31st clamps to Feb 29 in a leap year');
END $$;

DO $$
DECLARE v_after_feb DATE; v_after_march DATE;
BEGIN
  v_after_feb := advance_recurring_due_date('2026-01-31'::date, 'monthly', 31);
  v_after_march := advance_recurring_due_date(v_after_feb, 'monthly', 31);
  IF v_after_march <> '2026-03-31'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.3: expected re-derivation from day_of_month=31 to land on 2026-03-31, got %', v_after_march;
  END IF;
  PERFORM _pass('DB.PARITY.3', 'always re-derives from the original day_of_month — no permanent drift after a short month');
END $$;

DO $$
BEGIN
  IF advance_recurring_due_date('2026-01-31'::date, 'quarterly', 31) <> '2026-04-30'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.4: expected 2026-04-30';
  END IF;
  PERFORM _pass('DB.PARITY.4', 'quarterly clamps across a 3-month step landing on a 30-day month');
END $$;

DO $$
BEGIN
  IF advance_recurring_due_date('2028-02-29'::date, 'yearly', 29) <> '2029-02-28'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.5: expected 2029-02-28';
  END IF;
  PERFORM _pass('DB.PARITY.5', 'yearly clamps a leap-day template in a non-leap target year');
END $$;

DO $$
BEGIN
  IF advance_recurring_due_date('2026-01-31'::date, 'daily', NULL) <> '2026-02-01'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.6: expected 2026-02-01 for daily';
  END IF;
  IF advance_recurring_due_date('2026-01-28'::date, 'weekly', NULL) <> '2026-02-04'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.6: expected 2026-02-04 for weekly';
  END IF;
  IF advance_recurring_due_date('2026-01-28'::date, 'biweekly', NULL) <> '2026-02-11'::date THEN
    RAISE EXCEPTION 'FAIL DB.PARITY.6: expected 2026-02-11 for biweekly';
  END IF;
  PERFORM _pass('DB.PARITY.6', 'daily/weekly/biweekly advance by exactly 1/7/14 days, matching the TS reference');
END $$;

-- ============================================================================
-- Milestone 7 — RECURRING.*: generate_recurring_transactions(). All fixture
-- due dates are CURRENT_DATE-relative (never hardcoded absolute dates) so
-- these tests are correct regardless of when the suite actually runs.
-- ============================================================================

-- RECURRING.1: a single due, active template generates exactly one
-- transaction and advances next_due_date.
SAVEPOINT sp_recurring_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE;
  v_result JSONB;
  v_txn_count INT;
  v_new_due_date DATE;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.1 daily', 'daily', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  SELECT generate_recurring_transactions() INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL RECURRING.1: expected ok:true, got %', v_result; END IF;

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 1 THEN RAISE EXCEPTION 'FAIL RECURRING.1: expected exactly 1 generated transaction, got %', v_txn_count; END IF;

  SELECT next_due_date INTO v_new_due_date FROM recurring_transactions WHERE id = v_recurring_id;
  IF v_new_due_date <> v_due_date + 1 THEN RAISE EXCEPTION 'FAIL RECURRING.1: expected next_due_date to advance to %, got %', v_due_date + 1, v_new_due_date; END IF;

  PERFORM _pass('RECURRING.1', 'a single due active template generates exactly one transaction and advances next_due_date');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_1;

-- RECURRING.2: repeated app opens / duplicate RPC calls — idempotent.
SAVEPOINT sp_recurring_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE;
  v_txn_count INT;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.2 repeated', 'daily', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  PERFORM generate_recurring_transactions(); -- first "app open"
  PERFORM generate_recurring_transactions(); -- second "app open" / duplicate RPC call

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 1 THEN RAISE EXCEPTION 'FAIL RECURRING.2: expected still exactly 1 transaction after a second call, got %', v_txn_count; END IF;
  PERFORM _pass('RECURRING.2', 'repeated app opens / duplicate RPC calls do not generate a duplicate transaction — idempotent by construction (row lock + re-read), no client-side dedupe key involved');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_2;

-- RECURRING.3: multiple missed periods are caught up in a single call, with
-- correct re-derivation from the original day_of_month at each step.
SAVEPOINT sp_recurring_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE - 3;
  v_txn_count INT;
  v_new_due_date DATE;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.3 catchup', 'daily', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  PERFORM generate_recurring_transactions();

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 4 THEN RAISE EXCEPTION 'FAIL RECURRING.3: expected 4 missed daily occurrences (3 days late plus today) generated in one call, got %', v_txn_count; END IF;

  SELECT next_due_date INTO v_new_due_date FROM recurring_transactions WHERE id = v_recurring_id;
  IF v_new_due_date <> CURRENT_DATE + 1 THEN RAISE EXCEPTION 'FAIL RECURRING.3: expected next_due_date to land one day after today, got %', v_new_due_date; END IF;

  PERFORM _pass('RECURRING.3', 'one call catches up every missed occurrence (multiple missed periods) atomically in a single RPC call');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_3;

-- RECURRING.4: an inactive template is never generated from.
SAVEPOINT sp_recurring_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE - 1;
  v_txn_count INT;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, is_active, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.4 inactive', 'daily', v_due_date, FALSE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  PERFORM generate_recurring_transactions();

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 0 THEN RAISE EXCEPTION 'FAIL RECURRING.4: an inactive template must never generate, got % transactions', v_txn_count; END IF;
  PERFORM _pass('RECURRING.4', 'an inactive template is never generated from');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_4;

-- RECURRING.5: no sub claim => unauthenticated.
SAVEPOINT sp_recurring_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT generate_recurring_transactions() INTO v_result;
  IF v_result <> '{"ok": false, "error": "unauthenticated"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL RECURRING.5: expected unauthenticated, got %', v_result;
  END IF;
  PERFORM _pass('RECURRING.5', 'a call with no sub claim is rejected as unauthenticated');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_5;

-- RECURRING.6: a caller with no household => no_household.
SAVEPOINT sp_recurring_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT generate_recurring_transactions() INTO v_result;
  IF v_result <> '{"ok": false, "error": "no_household"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL RECURRING.6: expected no_household, got %', v_result;
  END IF;
  PERFORM _pass('RECURRING.6', 'a caller with no household gets {ok:false, error:no_household}');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_6;

-- RECURRING.7: cross-household isolation — User C's call never touches
-- Household 1's due templates, even though one genuinely is due.
SAVEPOINT sp_recurring_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.7 h1 due', 'daily', CURRENT_DATE - 1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_id;
  CREATE TEMP TABLE IF NOT EXISTS _sp_recurring_7 (recurring_id UUID);
  DELETE FROM _sp_recurring_7;
  INSERT INTO _sp_recurring_7 VALUES (v_id);
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$ BEGIN PERFORM generate_recurring_transactions(); END $$;
RESET role;

DO $$
DECLARE v_recurring_id UUID; v_txn_count INT;
BEGIN
  SELECT recurring_id INTO v_recurring_id FROM _sp_recurring_7;
  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 0 THEN RAISE EXCEPTION 'FAIL RECURRING.7: User C''s call generated a transaction for Household 1''s template, got % rows', v_txn_count; END IF;
  PERFORM _pass('RECURRING.7', 'a caller only ever generates from their own household''s due templates, never another household''s');
END $$;
ROLLBACK TO SAVEPOINT sp_recurring_7;

-- RECURRING.GRANTS.1/2: generate_recurring_transactions grants.
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'generate_recurring_transactions' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.1: generate_recurring_transactions is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('RECURRING.GRANTS.1', 'generate_recurring_transactions grants exclude anon and PUBLIC');
END $$;

SAVEPOINT sp_recurring_grants_2;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM generate_recurring_transactions();
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.2: anon was able to call generate_recurring_transactions';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('RECURRING.GRANTS.2', 'anon cannot EXECUTE generate_recurring_transactions');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_grants_2;

-- RECURRING.GRANTS.3/4: skip_recurring_occurrence grants.
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'skip_recurring_occurrence' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.3: skip_recurring_occurrence is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('RECURRING.GRANTS.3', 'skip_recurring_occurrence grants exclude anon and PUBLIC');
END $$;

SAVEPOINT sp_recurring_grants_4;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM skip_recurring_occurrence('5e000000-0000-0000-0000-000000000001'::uuid);
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.4: anon was able to call skip_recurring_occurrence';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('RECURRING.GRANTS.4', 'anon cannot EXECUTE skip_recurring_occurrence');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_recurring_grants_4;

-- RECURRING.GRANTS.5: advance_recurring_due_date grants.
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'advance_recurring_due_date' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.5: advance_recurring_due_date is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('RECURRING.GRANTS.5', 'advance_recurring_due_date grants exclude anon and PUBLIC');
END $$;

-- RECURRING.GRANTS.6: derive_savings_goal_completion is trigger-only.
-- The owning role (postgres) inherently retains EXECUTE as object owner;
-- no non-owner/application role should have an explicit EXECUTE grant.
DO $$
DECLARE v_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public'
    AND routine_name = 'derive_savings_goal_completion'
    AND grantee <> 'postgres';

  IF v_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL RECURRING.GRANTS.6: derive_savings_goal_completion has unexpected non-owner grants (%) — trigger-only function', v_grantees;
  END IF;

  PERFORM _pass('RECURRING.GRANTS.6', 'derive_savings_goal_completion has no EXECUTE grant to any non-owner role — trigger-only');
END $$;

-- ============================================================================
-- Milestone 7 — RECURRING.SKIP.*: skip_recurring_occurrence()
-- ============================================================================

-- SKIP.1: happy path — advances exactly one period, generates no
-- transaction, works even before the occurrence is actually due.
SAVEPOINT sp_skip_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE + 5;
  v_result JSONB;
  v_txn_count INT;
  v_new_due_date DATE;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'SKIP.1', 'weekly', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  SELECT skip_recurring_occurrence(v_recurring_id) INTO v_result;
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL SKIP.1: expected ok:true, got %', v_result; END IF;

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = v_recurring_id;
  IF v_txn_count <> 0 THEN RAISE EXCEPTION 'FAIL SKIP.1: skip must never generate a transaction, got %', v_txn_count; END IF;

  SELECT next_due_date INTO v_new_due_date FROM recurring_transactions WHERE id = v_recurring_id;
  IF v_new_due_date <> v_due_date + 7 THEN RAISE EXCEPTION 'FAIL SKIP.1: expected next_due_date to advance by exactly one week to %, got %', v_due_date + 7, v_new_due_date; END IF;

  PERFORM _pass('SKIP.1', 'skip_recurring_occurrence advances exactly one period with no transaction generated, works even before the occurrence is due');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_skip_1;

-- SKIP.2: an inactive template cannot be skipped — not_found, and its
-- next_due_date is left completely unchanged.
SAVEPOINT sp_skip_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_recurring_id UUID;
  v_due_date DATE := CURRENT_DATE + 5;
  v_result JSONB;
  v_after_due_date DATE;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, is_active, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'SKIP.2 inactive', 'weekly', v_due_date, FALSE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_recurring_id;

  SELECT skip_recurring_occurrence(v_recurring_id) INTO v_result;
  IF v_result <> '{"ok": false, "error": "not_found"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL SKIP.2: expected not_found for an inactive template, got %', v_result;
  END IF;

  SELECT next_due_date INTO v_after_due_date FROM recurring_transactions WHERE id = v_recurring_id;
  IF v_after_due_date <> v_due_date THEN
    RAISE EXCEPTION 'FAIL SKIP.2: an inactive template''s next_due_date must remain unchanged, expected % got %', v_due_date, v_after_due_date;
  END IF;

  PERFORM _pass('SKIP.2', 'an inactive recurring template cannot be skipped (not_found) and its next_due_date is left unchanged');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_skip_2;

-- SKIP.3: a cross-household template id => not_found, same shape as
-- nonexistent — no existence oracle.
SAVEPOINT sp_skip_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT skip_recurring_occurrence('5e000000-0000-0000-0000-000000000002'::uuid) INTO v_result;
  IF v_result <> '{"ok": false, "error": "not_found"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL SKIP.3: expected not_found for another household''s template, got %', v_result;
  END IF;
  PERFORM _pass('SKIP.3', 'a cross-household recurring template id returns not_found, same as nonexistent');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_skip_3;

-- ============================================================================
-- Milestone 7 — RECURRING.ATOMICITY: a forced INSERT failure partway through
-- the loop rolls back the WHOLE call — single PostgreSQL transaction
-- semantics. Two templates are due; whichever one the trigger's forced
-- failure hits, NEITHER template may retain a generated transaction or an
-- advanced cursor afterward.
-- ============================================================================

SAVEPOINT sp_recurring_atomicity;
CREATE OR REPLACE FUNCTION _test_force_failure_recurring() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.description = 'RECURRING.ATOMICITY trigger-target' THEN
    RAISE EXCEPTION 'test-forced-failure-recurring-atomicity';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER _test_block_recurring_insert BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION _test_force_failure_recurring();

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_a_id UUID;
  v_fail_id UUID;
  v_due_date DATE := CURRENT_DATE - 1;
BEGIN
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.ATOMICITY template-a', 'daily', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_a_id;
  INSERT INTO recurring_transactions (household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1234, 'RECURRING.ATOMICITY trigger-target', 'daily', v_due_date, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_fail_id;

  CREATE TEMP TABLE IF NOT EXISTS _sp_recurring_atomicity (a_id UUID, fail_id UUID, a_due_date DATE);
  DELETE FROM _sp_recurring_atomicity;
  INSERT INTO _sp_recurring_atomicity VALUES (v_a_id, v_fail_id, v_due_date);

  BEGIN
    PERFORM generate_recurring_transactions();
    RAISE EXCEPTION 'FAIL RECURRING.ATOMICITY: generate_recurring_transactions did not raise despite the forced trigger failure';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'test-forced-failure-recurring-atomicity' THEN
      RAISE EXCEPTION 'FAIL RECURRING.ATOMICITY: unexpected error: %', SQLERRM;
    END IF;
  END;
END $$;
RESET role;

DO $$
DECLARE
  v_a_id UUID; v_fail_id UUID; v_a_due_date DATE;
  v_a_txn_count INT; v_fail_txn_count INT; v_a_current_due_date DATE;
BEGIN
  SELECT a_id, fail_id, a_due_date INTO v_a_id, v_fail_id, v_a_due_date FROM _sp_recurring_atomicity;

  SELECT count(*) INTO v_a_txn_count FROM transactions WHERE recurring_id = v_a_id;
  SELECT count(*) INTO v_fail_txn_count FROM transactions WHERE recurring_id = v_fail_id;
  IF v_a_txn_count <> 0 THEN
    RAISE EXCEPTION 'FAIL RECURRING.ATOMICITY: a co-processed template''s transaction survived a forced failure elsewhere in the same call — not atomic, got % rows', v_a_txn_count;
  END IF;
  IF v_fail_txn_count <> 0 THEN
    RAISE EXCEPTION 'FAIL RECURRING.ATOMICITY: the failing template unexpectedly has a generated transaction, got % rows', v_fail_txn_count;
  END IF;

  SELECT next_due_date INTO v_a_current_due_date FROM recurring_transactions WHERE id = v_a_id;
  IF v_a_current_due_date <> v_a_due_date THEN
    RAISE EXCEPTION 'FAIL RECURRING.ATOMICITY: a co-processed template''s next_due_date advanced despite the whole call failing, expected % got %', v_a_due_date, v_a_current_due_date;
  END IF;

  PERFORM _pass('RECURRING.ATOMICITY', 'a forced failure partway through the loop rolls back the ENTIRE call — no partially-generated transaction, no partially-advanced cursor, for either template');
END $$;
ROLLBACK TO SAVEPOINT sp_recurring_atomicity;

-- ============================================================================
-- Milestone 7 — SAVINGS.TRIGGER.*: derive_savings_goal_completion is the
-- sole source of truth for is_completed; a client-supplied value is
-- silently overridden.
-- ============================================================================

-- SAVINGS.TRIGGER.1: INSERT with a contradictory is_completed=true supplied
-- by the client while current_agorot < target_agorot => trigger forces false.
SAVEPOINT sp_savings_trigger_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_is_completed BOOLEAN;
BEGIN
  INSERT INTO savings_goals (household_id, name, target_agorot, current_agorot, is_completed, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'SAVINGS.TRIGGER.1', 100000, 10000, TRUE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING is_completed INTO v_is_completed;
  IF v_is_completed IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.1: expected the trigger to override a contradictory is_completed=true on INSERT, got %', v_is_completed;
  END IF;
  PERFORM _pass('SAVINGS.TRIGGER.1', 'a client-supplied is_completed=true on INSERT is overridden by the DB trigger when current_agorot < target_agorot');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_savings_trigger_1;

-- SAVINGS.TRIGGER.2: UPDATE attempting to set is_completed=false directly
-- while current_agorot >= target_agorot => trigger forces true.
SAVEPOINT sp_savings_trigger_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_goal_id UUID; v_is_completed BOOLEAN;
BEGIN
  INSERT INTO savings_goals (household_id, name, target_agorot, current_agorot, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'SAVINGS.TRIGGER.2', 100000, 100000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_goal_id;

  UPDATE savings_goals SET is_completed = FALSE WHERE id = v_goal_id RETURNING is_completed INTO v_is_completed;
  IF v_is_completed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.2: expected the trigger to override a contradictory is_completed=false on UPDATE, got %', v_is_completed;
  END IF;
  PERFORM _pass('SAVINGS.TRIGGER.2', 'a client-supplied is_completed=false on UPDATE is overridden by the DB trigger when current_agorot >= target_agorot');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_savings_trigger_2;

-- SAVINGS.TRIGGER.3: a normal progress update (current_agorot only, no
-- is_completed in the payload) correctly derives is_completed on crossing.
SAVEPOINT sp_savings_trigger_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_goal_id UUID; v_is_completed BOOLEAN;
BEGIN
  INSERT INTO savings_goals (household_id, name, target_agorot, current_agorot, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'SAVINGS.TRIGGER.3', 100000, 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_goal_id;

  UPDATE savings_goals SET current_agorot = 100000 WHERE id = v_goal_id RETURNING is_completed INTO v_is_completed;
  IF v_is_completed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.3: expected is_completed=true after current_agorot reached target, got %', v_is_completed;
  END IF;
  PERFORM _pass('SAVINGS.TRIGGER.3', 'is_completed is correctly derived true when a plain current_agorot update reaches target');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_savings_trigger_3;

-- ============================================================================
-- Milestone 9 — Group 7: delete_own_account() (migration 004)
-- ============================================================================
-- Covers the three confirmed product decisions (admin succession, sole-member
-- household cascade, attribution-nulling vs. shared-data preservation), the
-- grant/search_path structural requirements every SECURITY DEFINER function
-- in this schema must meet, and the D2-widening regression the migration's
-- Part 2 exists to prevent. True concurrency (two members of the same
-- household calling this function at once) is covered separately near the
-- end of this file, in the isolated dblink section, for the same reason
-- test 5.9 lives there — a second real connection cannot see this
-- transaction's uncommitted fixtures.

-- 7.1: fixed search_path
DO $$
DECLARE v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config FROM pg_proc WHERE proname = 'delete_own_account' AND pronamespace = 'public'::regnamespace;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION 'FAIL 7.1: delete_own_account search_path not fixed, got %', v_config;
  END IF;
  PERFORM _pass('7.1', 'delete_own_account has a fixed search_path');
END $$;

-- 7.2: grants — authenticated only, via information_schema
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'delete_own_account' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 7.2: delete_own_account is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('7.2', 'delete_own_account grants exclude anon and PUBLIC');
END $$;

-- 7.3: grants — call as anon => EXECUTE denied
SAVEPOINT sp_7_3;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM delete_own_account();
    RAISE EXCEPTION 'FAIL 7.3: anon was able to call delete_own_account';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('7.3', 'anon cannot EXECUTE delete_own_account');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_3;

-- 7.4: requires auth — call with no sub claim. auth.uid() resolves to NULL,
-- which the function's own leading check maps to a clean unauthenticated
-- response, mirroring 5.2's identical assertion for accept_invitation.
SAVEPOINT sp_7_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_own_account() INTO v_result;
  IF v_result <> '{"ok": false, "error": "unauthenticated"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 7.4: expected unauthenticated, got %', v_result;
  END IF;
  PERFORM _pass('7.4', 'a call with no sub claim is rejected as unauthenticated');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_4;

-- 7.5: regular member (User B) deletes their account. Household 1 continues,
-- no admin change, B's own attribution nulled, B's personal account
-- converts to household-owned. A test-local transaction/personal account
-- created_by/owner_id = B is inserted first (the shared fixture has no
-- B-created rows) so the nulling behavior is actually observable.
-- Both fixture rows are inserted as User B, not User A: migration 004's
-- own D2.6 check (created_by = auth.uid(), confirmed passing moments ago
-- at test D2.6) rejects a transaction INSERT whose created_by doesn't
-- match the acting session — a real local-Postgres failure this exact
-- fixture originally hit when it ran as A while attributing the row to B.
SAVEPOINT sp_7_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO accounts (id, household_id, owner_id, name, type)
  VALUES ('5a000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ארנק אישי של B', 'cash');
  INSERT INTO transactions (id, household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
  VALUES ('5f000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -700, 'קניה של B', '2026-08-07', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_own_account() INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'household_deleted')::boolean OR v_result->'new_admin_id' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 7.5: expected {ok:true, household_deleted:false, new_admin_id:null} for a regular member, got %', v_result;
  END IF;
  PERFORM _pass('7.5', 'a regular member deleting their account does not delete or promote anything in the household');
END $$;
RESET role;

DO $$
DECLARE v_role TEXT; v_owner UUID; v_created_by UUID; v_user_exists BOOLEAN; v_household_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') INTO v_user_exists;
  IF v_user_exists THEN RAISE EXCEPTION 'FAIL 7.5: User B''s auth.users row still exists'; END IF;

  SELECT EXISTS (SELECT 1 FROM households WHERE id = '11111111-1111-1111-1111-111111111111') INTO v_household_exists;
  IF NOT v_household_exists THEN RAISE EXCEPTION 'FAIL 7.5: Household 1 was deleted despite User A remaining'; END IF;

  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'FAIL 7.5: User A''s role changed to %, expected unchanged admin', v_role; END IF;

  SELECT owner_id INTO v_owner FROM accounts WHERE id = '5a000000-0000-0000-0000-0000000000b1';
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'FAIL 7.5: B''s personal account owner_id was not nulled, got %', v_owner; END IF;

  SELECT created_by INTO v_created_by FROM transactions WHERE id = '5f000000-0000-0000-0000-0000000000b1';
  IF v_created_by IS NOT NULL THEN RAISE EXCEPTION 'FAIL 7.5: B''s transaction created_by was not nulled, got %', v_created_by; END IF;

  PERFORM _pass('7.5', 'the household is preserved, User A keeps admin, User B''s personal account and transaction attribution are nulled/converted, not deleted');
END $$;

-- 7.6 (D2.NULL): a remaining household member can still UPDATE a
-- transaction whose created_by was just nulled by 7.5 — the exact
-- regression migration 004 Part 2 exists to prevent (before it, this
-- UPDATE would have been silently rejected: NULL IN (SELECT ...) is never
-- TRUE).
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE transactions SET description = 'עודכן על ידי A' WHERE id = '5f000000-0000-0000-0000-0000000000b1';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 7.6: expected the remaining member to be able to UPDATE a transaction with a NULL created_by, %  rows affected', v_rows;
  END IF;
  PERFORM _pass('7.6', 'a remaining household member can still UPDATE a transaction whose creator has departed (created_by IS NULL)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_5;

-- 7.7 (accepted behavior, pinned): an ACTIVE household member can null out
-- created_by on a transaction created by another ACTIVE member too, not
-- only a departed one -- reviewed and accepted consequence of Part 2's
-- widened WITH CHECK (see the migration's own comment). Stays
-- same-household; not a boundary violation.
SAVEPOINT sp_7_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  -- 5f...001 was created_by User A, who is still an active member here.
  UPDATE transactions SET created_by = NULL WHERE id = '5f000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 7.7: expected User B to be able to null an active co-member''s created_by, %  rows affected', v_rows;
  END IF;
  PERFORM _pass('7.7', 'an active member can null created_by on a still-active co-member''s row (accepted, same-household, pinned by this test)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_7;

-- 7.8: household admin (User A) deletes their account. Household 1
-- continues (User B remains), User B is auto-promoted to admin, A's
-- attribution is nulled everywhere it appears.
SAVEPOINT sp_7_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_own_account() INTO v_result;
  IF NOT (v_result->>'ok')::boolean
     OR (v_result->>'household_deleted')::boolean
     OR v_result->>'new_admin_id' <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  THEN
    RAISE EXCEPTION 'FAIL 7.8: expected household preserved with User B promoted, got %', v_result;
  END IF;
  PERFORM _pass('7.8', 'an admin deleting their account with other members remaining auto-promotes the longest-tenured remaining member');
END $$;
RESET role;

DO $$
DECLARE v_role TEXT; v_household_created_by UUID; v_txn_created_by UUID; v_user_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') INTO v_user_exists;
  IF v_user_exists THEN RAISE EXCEPTION 'FAIL 7.8: User A''s auth.users row still exists'; END IF;

  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'FAIL 7.8: User B''s role is %, expected admin after succession', v_role; END IF;

  SELECT created_by INTO v_household_created_by FROM households WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_household_created_by IS NOT NULL THEN RAISE EXCEPTION 'FAIL 7.8: households.created_by was not nulled, got %', v_household_created_by; END IF;

  SELECT created_by INTO v_txn_created_by FROM transactions WHERE id = '5f000000-0000-0000-0000-000000000001';
  IF v_txn_created_by IS NOT NULL THEN RAISE EXCEPTION 'FAIL 7.8: transaction 5f...001''s created_by (User A) was not nulled, got %', v_txn_created_by; END IF;

  PERFORM _pass('7.8', 'the departed admin''s attribution is nulled on households.created_by and on every transaction they created');
END $$;

-- 7.9: the newly-promoted admin (User B) can now exercise an admin-only
-- capability, proving the SECURITY DEFINER role UPDATE actually took
-- effect for authorization purposes, not just for the role column's value.
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE households SET name = 'שם חדש אחרי קידום' WHERE id = '11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 7.9: expected the newly-promoted admin to be able to rename the household (admin-only policy), %  rows affected', v_rows;
  END IF;
  PERFORM _pass('7.9', 'the auto-promoted member can immediately exercise admin-only RLS policies (households_update)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_8;

-- 7.10: sole member (User C, Household 2) deletes their account. The
-- entire household and every row that belonged to it must be gone.
SAVEPOINT sp_7_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_own_account() INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR NOT (v_result->>'household_deleted')::boolean THEN
    RAISE EXCEPTION 'FAIL 7.10: expected {ok:true, household_deleted:true} for the sole member of Household 2, got %', v_result;
  END IF;
  PERFORM _pass('7.10', 'the sole member of a household deleting their account reports household_deleted:true');
END $$;
RESET role;

DO $$
DECLARE v_count BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM households WHERE id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 row still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 still has membership rows';
  END IF;
  IF EXISTS (SELECT 1 FROM accounts WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 accounts were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 transactions were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_transactions WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 recurring_transactions were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM budgets WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 budgets were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM budget_allocations WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 budget_allocations were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 savings_goals were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM category_rules WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 category_rules were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM categories WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2''s custom category was not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM invitations WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 7.10: Household 2 invitations were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') THEN
    RAISE EXCEPTION 'FAIL 7.10: User C''s auth.users row still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') THEN
    RAISE EXCEPTION 'FAIL 7.10: User C''s profile row still exists';
  END IF;
  PERFORM _pass('7.10', 'a sole member deleting their account cascades the entire household: every account/category/category_rule/transaction/recurring_transaction/budget/budget_allocation/savings_goal/invitation, plus the user''s own profile');
END $$;
ROLLBACK TO SAVEPOINT sp_7_10;

-- 7.11: a user with no household deletes their account -- just the user,
-- nothing household-related.
SAVEPOINT sp_7_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_own_account() INTO v_result;
  IF v_result <> '{"ok": true, "household_deleted": false, "new_admin_id": null}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 7.11: expected a plain no-household success, got %', v_result;
  END IF;
  PERFORM _pass('7.11', 'a user with no household deleting their account affects only their own auth.users/profile row');
END $$;
RESET role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') THEN
    RAISE EXCEPTION 'FAIL 7.11: User D''s auth.users row still exists';
  END IF;
  PERFORM _pass('7.11', 'User D''s auth.users row is gone');
END $$;
ROLLBACK TO SAVEPOINT sp_7_11;

-- 7.12: idempotency -- calling delete_own_account() a second time with the
-- same (now stale) session is a harmless no-op, not an error. Models a
-- client retry, or a still-valid JWT issued before the first call.
SAVEPOINT sp_7_12;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';
DO $$
DECLARE v_first JSONB; v_second JSONB;
BEGIN
  SELECT delete_own_account() INTO v_first;
  SELECT delete_own_account() INTO v_second;
  IF v_first <> '{"ok": true, "household_deleted": false, "new_admin_id": null}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 7.12: unexpected first-call result %', v_first;
  END IF;
  IF v_second <> '{"ok": true, "household_deleted": false, "new_admin_id": null}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 7.12: expected a harmless no-op on the second call, got %', v_second;
  END IF;
  PERFORM _pass('7.12', 'calling delete_own_account() twice in a row is idempotent -- the second call is a clean no-op');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_7_12;

-- ============================================================================
-- Group 8 — leave_household() (migration 005)
-- ============================================================================
-- Covers the same three decisions as Group 7 (admin succession, sole-member
-- cascade, attribution nulling), extended to the one way this action
-- differs from delete_own_account(): the caller's own auth.users row is
-- never touched. True concurrency (two members of the same household both
-- calling leave_household() at once) is covered separately near the end of
-- this file, in the isolated dblink section, for the same reason 5.9 and
-- DELETE_ACCOUNT.CONCURRENT live there.

-- 8.1: fixed search_path
DO $$
DECLARE v_config TEXT[];
BEGIN
  SELECT proconfig INTO v_config FROM pg_proc WHERE proname = 'leave_household' AND pronamespace = 'public'::regnamespace;
  IF v_config IS NULL OR NOT ('search_path=public, pg_temp' = ANY (v_config)) THEN
    RAISE EXCEPTION 'FAIL 8.1: leave_household search_path not fixed, got %', v_config;
  END IF;
  PERFORM _pass('8.1', 'leave_household has a fixed search_path');
END $$;

-- 8.2: grants — authenticated only, via information_schema
DO $$
DECLARE v_bad_grantees TEXT;
BEGIN
  SELECT string_agg(grantee, ',') INTO v_bad_grantees
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'leave_household' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad_grantees IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 8.2: leave_household is granted to %, expected only authenticated', v_bad_grantees;
  END IF;
  PERFORM _pass('8.2', 'leave_household grants exclude anon and PUBLIC');
END $$;

-- 8.3: grants — call as anon => EXECUTE denied
SAVEPOINT sp_8_3;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM leave_household();
    RAISE EXCEPTION 'FAIL 8.3: anon was able to call leave_household';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('8.3', 'anon cannot EXECUTE leave_household');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_3;

-- 8.4: requires auth — call with no sub claim.
SAVEPOINT sp_8_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF v_result <> '{"ok": false, "error": "unauthenticated"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 8.4: expected unauthenticated, got %', v_result;
  END IF;
  PERFORM _pass('8.4', 'a call with no sub claim is rejected as unauthenticated');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_4;

-- 8.5: authenticated caller with no household at all => not_a_member,
-- distinct from unauthenticated (7.4's equivalent for delete_own_account
-- has no such case, since a user with no household still has an account to
-- delete — leave_household needs this new error case because "leave" is
-- meaningless with no membership to leave).
SAVEPOINT sp_8_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF v_result <> '{"ok": false, "error": "not_a_member"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 8.5: expected not_a_member, got %', v_result;
  END IF;
  PERFORM _pass('8.5', 'a user with no household gets not_a_member, not an unhandled error');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_5;

-- 8.6: regular member (User B) leaves Household 1. Household continues, no
-- admin change, B's own attribution nulled, B's personal account converts
-- to household-owned, B's auth.users row is untouched (unlike 7.5's
-- delete_own_account equivalent). Same local fixture pattern as 7.5: a
-- B-created transaction/personal account is inserted first (as B, so D2.6's
-- created_by = auth.uid() check is satisfied) so the nulling is observable.
SAVEPOINT sp_8_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO accounts (id, household_id, owner_id, name, type)
  VALUES ('5a000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'ארנק אישי של B (8.6)', 'cash');
  INSERT INTO transactions (id, household_id, account_id, category_id, amount_agorot, description, txn_date, created_by)
  VALUES ('5f000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -800, 'קניה של B (8.6)', '2026-08-08', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
END $$;
RESET role;

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'household_deleted')::boolean OR v_result->'new_admin_id' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 8.6: expected {ok:true, household_deleted:false, new_admin_id:null} for a regular member, got %', v_result;
  END IF;
  PERFORM _pass('8.6', 'a regular member leaving does not delete or promote anything in the household');
END $$;
RESET role;

DO $$
DECLARE v_role TEXT; v_owner UUID; v_created_by UUID; v_user_exists BOOLEAN; v_still_member BOOLEAN; v_household_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') INTO v_user_exists;
  IF NOT v_user_exists THEN RAISE EXCEPTION 'FAIL 8.6: User B''s auth.users row was deleted -- leave must never delete the account'; END IF;

  SELECT EXISTS (SELECT 1 FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') INTO v_still_member;
  IF v_still_member THEN RAISE EXCEPTION 'FAIL 8.6: User B''s household_members row still exists'; END IF;

  SELECT EXISTS (SELECT 1 FROM households WHERE id = '11111111-1111-1111-1111-111111111111') INTO v_household_exists;
  IF NOT v_household_exists THEN RAISE EXCEPTION 'FAIL 8.6: Household 1 was deleted despite User A remaining'; END IF;

  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'FAIL 8.6: User A''s role changed to %, expected unchanged admin', v_role; END IF;

  SELECT owner_id INTO v_owner FROM accounts WHERE id = '5a000000-0000-0000-0000-0000000000b2';
  IF v_owner IS NOT NULL THEN RAISE EXCEPTION 'FAIL 8.6: B''s personal account owner_id was not nulled, got %', v_owner; END IF;

  SELECT created_by INTO v_created_by FROM transactions WHERE id = '5f000000-0000-0000-0000-0000000000b2';
  IF v_created_by IS NOT NULL THEN RAISE EXCEPTION 'FAIL 8.6: B''s transaction created_by was not nulled, got %', v_created_by; END IF;

  PERFORM _pass('8.6', 'B keeps their account but is removed from the household; B''s personal account and transaction attribution are nulled/converted, not left dangling');
END $$;

-- 8.7 (D2.NULL, leave path): a remaining household member can still UPDATE
-- a transaction whose created_by was just nulled by 8.6 -- the same
-- migration-004-Part-2 regression, now proven for the leave path too, not
-- only the delete-account path (7.6 already covers the latter).
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE transactions SET description = 'עודכן על ידי A אחרי עזיבת B' WHERE id = '5f000000-0000-0000-0000-0000000000b2';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 8.7: expected the remaining member to be able to UPDATE a transaction with a NULL created_by, %  rows affected', v_rows;
  END IF;
  PERFORM _pass('8.7', 'a remaining household member can still UPDATE a transaction whose creator has left (created_by IS NULL)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_6;

-- 8.8: household admin (User A) leaves Household 1 (User B remains).
-- Household continues, B is auto-promoted to admin, A's attribution is
-- nulled, A's auth.users row is untouched.
SAVEPOINT sp_8_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean
     OR (v_result->>'household_deleted')::boolean
     OR v_result->>'new_admin_id' <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  THEN
    RAISE EXCEPTION 'FAIL 8.8: expected household preserved with User B promoted, got %', v_result;
  END IF;
  PERFORM _pass('8.8', 'an admin leaving a multi-member household auto-promotes the longest-tenured remaining member');
END $$;
RESET role;

DO $$
DECLARE v_role TEXT; v_household_created_by UUID; v_user_exists BOOLEAN; v_still_member BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') INTO v_user_exists;
  IF NOT v_user_exists THEN RAISE EXCEPTION 'FAIL 8.8: User A''s auth.users row was deleted -- leave must never delete the account'; END IF;

  SELECT EXISTS (SELECT 1 FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') INTO v_still_member;
  IF v_still_member THEN RAISE EXCEPTION 'FAIL 8.8: User A''s household_members row still exists'; END IF;

  SELECT role INTO v_role FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  IF v_role <> 'admin' THEN RAISE EXCEPTION 'FAIL 8.8: User B''s role is %, expected admin after succession', v_role; END IF;

  SELECT created_by INTO v_household_created_by FROM households WHERE id = '11111111-1111-1111-1111-111111111111';
  IF v_household_created_by IS NOT NULL THEN RAISE EXCEPTION 'FAIL 8.8: households.created_by was not nulled, got %', v_household_created_by; END IF;

  PERFORM _pass('8.8', 'the departed admin keeps their account, loses membership, and their attribution is nulled on households.created_by');
END $$;

-- 8.9: the newly-promoted admin (User B) can now exercise an admin-only
-- capability, proving the SECURITY DEFINER role UPDATE actually took
-- effect for authorization purposes (mirrors 7.9 for the leave path).
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  UPDATE households SET name = 'שם חדש אחרי עזיבת מנהל' WHERE id = '11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'FAIL 8.9: expected the newly-promoted admin to be able to rename the household, %  rows affected', v_rows;
  END IF;
  PERFORM _pass('8.9', 'the auto-promoted member can immediately exercise admin-only RLS policies (households_update)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_8;

-- 8.10: sole member (User C, Household 2) leaves. The entire household and
-- every row that belonged to it must be gone -- but, unlike 7.10's
-- delete_own_account equivalent, User C's own account must survive intact.
SAVEPOINT sp_8_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR NOT (v_result->>'household_deleted')::boolean THEN
    RAISE EXCEPTION 'FAIL 8.10: expected {ok:true, household_deleted:true} for the sole member of Household 2, got %', v_result;
  END IF;
  PERFORM _pass('8.10', 'the sole member of a household leaving reports household_deleted:true');
END $$;
RESET role;

DO $$
DECLARE v_user_exists BOOLEAN; v_profile_exists BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM households WHERE id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 row still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM household_members WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 still has membership rows';
  END IF;
  IF EXISTS (SELECT 1 FROM accounts WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 accounts were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 transactions were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_transactions WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 recurring_transactions were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM budgets WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 budgets were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM budget_allocations WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 budget_allocations were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 savings_goals were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM category_rules WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 category_rules were not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM categories WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2''s custom category was not cascade-deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM invitations WHERE household_id = '22222222-2222-2222-2222-222222222222') THEN
    RAISE EXCEPTION 'FAIL 8.10: Household 2 invitations were not cascade-deleted';
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') INTO v_user_exists;
  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'FAIL 8.10: User C''s auth.users row was deleted -- leaving a sole-member household must never delete the account';
  END IF;

  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') INTO v_profile_exists;
  IF NOT v_profile_exists THEN
    RAISE EXCEPTION 'FAIL 8.10: User C''s profile row was deleted -- leaving must never delete the account';
  END IF;

  PERFORM _pass('8.10', 'a sole member leaving cascades the entire household (accounts/categories/category_rules/transactions/recurring_transactions/budgets/budget_allocations/savings_goals/invitations/membership), while User C''s own auth.users and profile rows survive untouched');
END $$;
ROLLBACK TO SAVEPOINT sp_8_10;

-- 8.11: genuine idempotency -- a user who actually left, calling
-- leave_household() again with the same (now stale) session, gets a
-- harmless repeated not_a_member, not an error and not a second attempt at
-- promotion/cascade. (database-security-reviewer finding: an earlier
-- version of this test used a user who was NEVER a member at all, which
-- only exercises the top-of-function NOT FOUND check, not a real repeat
-- call after a real leave -- this version does the real thing.) User B
-- leaves Household 1 first (regular member, no succession involved, kept
-- separate from the admin-succession tests above via its own savepoint).
SAVEPOINT sp_8_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_first JSONB; v_second JSONB;
BEGIN
  SELECT leave_household() INTO v_first;
  IF NOT (v_first->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 8.11: expected the first (real) leave to succeed, got %', v_first;
  END IF;

  SELECT leave_household() INTO v_second;
  IF v_second <> '{"ok": false, "error": "not_a_member"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL 8.11: expected a harmless repeated not_a_member on the second call after a real leave, got %', v_second;
  END IF;
  PERFORM _pass('8.11', 'calling leave_household() again after a real leave is idempotent -- the second call cleanly reports not_a_member (the caller now has zero household_members rows, the same top-of-function check 8.5 exercises), not a repeated promotion/cascade attempt');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_11;

-- 8.12 (HIGH finding, database-security-reviewer): household_members_delete
-- (tightened by this migration's Part 3) rejects an admin's raw self-DELETE
-- -- the exact bypass that let an admin skip both succession-aware
-- functions entirely before this migration. User A (Household 1's admin)
-- attempts the raw path leave_household() itself uses internally; RLS must
-- reject it (0 rows affected, not an error -- DELETE matching zero visible
-- rows is not a Postgres error, it is how RLS silently hides an
-- unauthorized row from a statement that would otherwise have matched it).
SAVEPOINT sp_8_12;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_still_admin BOOLEAN;
BEGIN
  DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 8.12: expected the admin''s raw self-DELETE to affect 0 rows (RLS-rejected), affected %', v_rows;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND role = 'admin'
  ) INTO v_still_admin;
  IF NOT v_still_admin THEN
    RAISE EXCEPTION 'FAIL 8.12: User A''s admin membership row is gone -- the raw self-DELETE bypass was not actually closed';
  END IF;

  PERFORM _pass('8.12', 'an admin cannot self-remove via the raw household_members_delete policy -- only leave_household()/delete_own_account() can remove an admin''s own row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_8_12;

-- 8.13 (CRITICAL finding, database-security-reviewer): the FOR UPDATE fix
-- on the succession-candidate SELECT correctly skips a vanished top
-- candidate and promotes the next-longest-tenured one still present,
-- rather than silently reporting a promotion that never happened.
-- Deterministic, not a race -- simulates "the selected candidate was
-- already removed by a concurrent unlocked action" by removing User B
-- (Household 1's longest-tenured non-admin member, who
-- ORDER BY joined_at ASC would otherwise select) before User A leaves,
-- leaving User F (inserted here, joined after B) as the only remaining
-- candidate. Proves the logic fix; the true concurrent-transaction timing
-- this bug actually manifests through is NOT covered here or anywhere else
-- in this file -- see migration 005's own header for why, and its
-- NEEDS LIVE VERIFICATION note.
SAVEPOINT sp_8_13;
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000060', 'authenticated', 'authenticated', 'user-f@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"User F"}', NOW(), NOW(), '', '', '', '');
INSERT INTO household_members (household_id, user_id, role, joined_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'f0000000-0000-0000-0000-000000000060', 'member', NOW() + INTERVAL '1 day');
DELETE FROM household_members WHERE household_id = '11111111-1111-1111-1111-111111111111' AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean
     OR (v_result->>'household_deleted')::boolean
     OR v_result->>'new_admin_id' <> 'f0000000-0000-0000-0000-000000000060'
  THEN
    RAISE EXCEPTION 'FAIL 8.13: expected User F (the only remaining candidate, since B is already gone) promoted, got %', v_result;
  END IF;
  PERFORM _pass('8.13', 'when the longest-tenured candidate no longer exists, the FOR UPDATE select correctly promotes the next candidate still present, instead of failing or reporting a false promotion');
END $$;
RESET role;
-- Rolls back the fixture INSERTs above too (User F, their membership row,
-- and User B's removal) -- no separate cleanup needed, same as every other
-- SAVEPOINT-scoped test in this file.
ROLLBACK TO SAVEPOINT sp_8_13;

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
  RAISE NOTICE '=== % tests passed (Groups 1,2,3,4 in full; 3b,3c,5 minus 5.9,6 in full; D2/D6/VM/RPC/grants-parity Milestone 6; DB.PARITY/RECURRING/RECURRING.GRANTS/RECURRING.SKIP/RECURRING.ATOMICITY/SAVINGS.TRIGGER Milestone 7 additions, minus RECURRING.CONCURRENT; Group 7 Milestone 9 additions, minus DELETE_ACCOUNT.CONCURRENT; Group 8 leave_household additions, minus LEAVE.CONCURRENT) ===', v_total;
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

-- ============================================================================
-- Test RECURRING.CONCURRENT — true concurrency: two members of the SAME
-- household call generate_recurring_transactions() at the same time for the
-- same due template. Needs a second real connection (dblink), so — like 5.9
-- and ADR-020-race above — it commits its own fixture and cleans up after
-- itself.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000020', 'authenticated', 'authenticated', 'race-recurring-1@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race Recurring 1"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'race-recurring-2@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Race Recurring 2"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('77777777-7777-7777-7777-777777777777', 'בית מרוץ הו״ק', 'f0000000-0000-0000-0000-000000000020');
INSERT INTO household_members (household_id, user_id, role) VALUES
  ('77777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-000000000020', 'admin'),
  ('77777777-7777-7777-7777-777777777777', 'f0000000-0000-0000-0000-000000000021', 'member');
INSERT INTO accounts (id, household_id, name, type) VALUES
  ('7a000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', 'חשבון מרוץ הו״ק', 'checking');
INSERT INTO recurring_transactions (id, household_id, account_id, amount_agorot, description, frequency, next_due_date, created_by) VALUES
  ('7e000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', '7a000000-0000-0000-0000-000000000001', -1234, 'הו״ק מרוץ', 'daily', CURRENT_DATE, 'f0000000-0000-0000-0000-000000000020');

DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
  v_txn_count INT;
  v_final_due_date DATE;
BEGIN
  PERFORM dblink_connect('conn1', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('conn2', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

  PERFORM dblink_exec('conn1', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn1', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000020","role":"authenticated"}'$q$);
  PERFORM dblink_exec('conn2', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn2', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000021","role":"authenticated"}'$q$);

  -- Both household members race generate_recurring_transactions() for the
  -- SAME due template at the same time.
  PERFORM dblink_send_query('conn1', $q$SELECT generate_recurring_transactions()$q$);
  PERFORM dblink_send_query('conn2', $q$SELECT generate_recurring_transactions()$q$);

  SELECT res INTO v_r1 FROM dblink_get_result('conn1') AS t(res JSONB);
  SELECT res INTO v_r2 FROM dblink_get_result('conn2') AS t(res JSONB);
  PERFORM dblink_get_result('conn1');
  PERFORM dblink_get_result('conn2');

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  SELECT count(*) INTO v_txn_count FROM transactions WHERE recurring_id = '7e000000-0000-0000-0000-000000000001';
  SELECT next_due_date INTO v_final_due_date FROM recurring_transactions WHERE id = '7e000000-0000-0000-0000-000000000001';

  IF v_txn_count <> 1 THEN
    RAISE EXCEPTION 'FAIL RECURRING.CONCURRENT: expected exactly 1 transaction generated from two concurrent calls, got % (r1=%, r2=%)', v_txn_count, v_r1, v_r2;
  END IF;
  IF v_final_due_date <> CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'FAIL RECURRING.CONCURRENT: expected next_due_date to have advanced exactly once, to %, got %', CURRENT_DATE + 1, v_final_due_date;
  END IF;

  RAISE NOTICE 'PASS RECURRING.CONCURRENT: two concurrent generate_recurring_transactions() calls from different household members => exactly one transaction generated, cursor advanced exactly once';
END $$;

-- Cleanup — real DELETEs, since this section committed its own fixture.
DELETE FROM transactions WHERE recurring_id = '7e000000-0000-0000-0000-000000000001';
DELETE FROM recurring_transactions WHERE id = '7e000000-0000-0000-0000-000000000001';
DELETE FROM accounts WHERE id = '7a000000-0000-0000-0000-000000000001';
DELETE FROM household_members WHERE household_id = '77777777-7777-7777-7777-777777777777';
DELETE FROM households WHERE id = '77777777-7777-7777-7777-777777777777';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000020', 'f0000000-0000-0000-0000-000000000021');

-- ============================================================================
-- Test DELETE_ACCOUNT.CONCURRENT — true concurrency: the two members of a
-- 2-person household both call delete_own_account() at the same moment.
-- Milestone 9 — the specific scenario database-security-reviewer found a
-- real deadlock in during design review (two SELECT ... FOR UPDATE calls,
-- each already holding its own row locked, each then blocking on the
-- other's — a circular wait). The fix replaced that with a single
-- pg_advisory_xact_lock keyed on household_id. This test proves the fix:
-- both calls must complete cleanly with no deadlock error, and the household
-- must end up fully and correctly resolved regardless of which of the two
-- calls the database happens to run first. User 40 is admin, User 41 is a
-- plain member — whichever call wins the lock first promotes the other to
-- admin (decision 1); the second call then re-reads AFTER acquiring the
-- lock, sees itself as the sole remaining (now-admin) member, and deletes
-- the household outright (decision 2) — exercising both decision branches
-- in one race, exactly the interleaving a stale, pre-lock read would get
-- wrong.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000040', 'authenticated', 'authenticated', 'del-race-1@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Del Race 1"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000041', 'authenticated', 'authenticated', 'del-race-2@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Del Race 2"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('66666666-6666-6666-6666-666666666666', 'בית מרוץ מחיקה', 'f0000000-0000-0000-0000-000000000040');

INSERT INTO household_members (household_id, user_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'f0000000-0000-0000-0000-000000000040', 'admin'),
  ('66666666-6666-6666-6666-666666666666', 'f0000000-0000-0000-0000-000000000041', 'member');

DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
  v_household_exists BOOLEAN;
  v_user1_exists BOOLEAN;
  v_user2_exists BOOLEAN;
  v_ok_count INT;
BEGIN
  PERFORM dblink_connect('conn1', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('conn2', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

  PERFORM dblink_exec('conn1', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn1', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000040","role":"authenticated"}'$q$);
  PERFORM dblink_exec('conn2', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn2', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000041","role":"authenticated"}'$q$);

  -- Dispatch both calls asynchronously before collecting either result, so
  -- they race on the advisory lock exactly as they would in production.
  PERFORM dblink_send_query('conn1', $q$SELECT delete_own_account()$q$);
  PERFORM dblink_send_query('conn2', $q$SELECT delete_own_account()$q$);

  SELECT res INTO v_r1 FROM dblink_get_result('conn1') AS t(res JSONB);
  SELECT res INTO v_r2 FROM dblink_get_result('conn2') AS t(res JSONB);
  PERFORM dblink_get_result('conn1'); -- drain end-of-results marker
  PERFORM dblink_get_result('conn2');

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  SELECT (CASE WHEN (v_r1->>'ok')::boolean THEN 1 ELSE 0 END) + (CASE WHEN (v_r2->>'ok')::boolean THEN 1 ELSE 0 END) INTO v_ok_count;
  IF v_ok_count <> 2 THEN
    RAISE EXCEPTION 'FAIL DELETE_ACCOUNT.CONCURRENT: expected both concurrent calls to succeed cleanly (no deadlock), got % successes (r1=%, r2=%)', v_ok_count, v_r1, v_r2;
  END IF;

  SELECT EXISTS (SELECT 1 FROM households WHERE id = '66666666-6666-6666-6666-666666666666') INTO v_household_exists;
  IF v_household_exists THEN
    RAISE EXCEPTION 'FAIL DELETE_ACCOUNT.CONCURRENT: household still exists after both members deleted their accounts (r1=%, r2=%)', v_r1, v_r2;
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f0000000-0000-0000-0000-000000000040') INTO v_user1_exists;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f0000000-0000-0000-0000-000000000041') INTO v_user2_exists;
  IF v_user1_exists OR v_user2_exists THEN
    RAISE EXCEPTION 'FAIL DELETE_ACCOUNT.CONCURRENT: expected both users'' auth.users rows gone, got user1=%, user2=%', v_user1_exists, v_user2_exists;
  END IF;

  RAISE NOTICE 'PASS DELETE_ACCOUNT.CONCURRENT: two concurrent delete_own_account() calls from the two members of the same household => no deadlock, both succeed, household and both users fully gone (r1=%, r2=%)', v_r1, v_r2;
END $$;

-- Cleanup — real DELETEs, in case any assertion above failed partway and
-- left something behind (the happy path already leaves nothing to clean).
DELETE FROM household_members WHERE household_id = '66666666-6666-6666-6666-666666666666';
DELETE FROM households WHERE id = '66666666-6666-6666-6666-666666666666';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000040', 'f0000000-0000-0000-0000-000000000041');

-- ============================================================================
-- Test LEAVE.CONCURRENT — true concurrency: the two members of a 2-person
-- household both call leave_household() at the same moment. Migration 005
-- — same scenario and same fix (a single pg_advisory_xact_lock keyed on
-- household_id, SHARED with delete_own_account()'s class 72702 — see the
-- migration's header for why that sharing is required, not incidental) as
-- DELETE_ACCOUNT.CONCURRENT above, but proving the leave path specifically:
-- User 50 is admin, User 51 is a plain member — whichever call wins the
-- lock first promotes the other to admin (decision 2) and removes itself;
-- the second call then re-reads AFTER acquiring the lock, sees itself as
-- the sole remaining (now-admin) member, and deletes the household outright
-- (decision 3) — exercising both decision branches in one race, exactly
-- like DELETE_ACCOUNT.CONCURRENT, but the critical extra assertion here is
-- that BOTH users' auth.users rows survive: leave must never delete an
-- account, concurrently or otherwise.
-- ============================================================================

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000050', 'authenticated', 'authenticated', 'leave-race-1@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Leave Race 1"}', NOW(), NOW(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000051', 'authenticated', 'authenticated', 'leave-race-2@test.local', crypt('Test123!', gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{"display_name":"Leave Race 2"}', NOW(), NOW(), '', '', '', '');

INSERT INTO households (id, name, created_by) VALUES
  ('55555555-5555-5555-5555-555555555555', 'בית מרוץ עזיבה', 'f0000000-0000-0000-0000-000000000050');

INSERT INTO household_members (household_id, user_id, role) VALUES
  ('55555555-5555-5555-5555-555555555555', 'f0000000-0000-0000-0000-000000000050', 'admin'),
  ('55555555-5555-5555-5555-555555555555', 'f0000000-0000-0000-0000-000000000051', 'member');

DO $$
DECLARE
  v_r1 JSONB;
  v_r2 JSONB;
  v_household_exists BOOLEAN;
  v_user1_exists BOOLEAN;
  v_user2_exists BOOLEAN;
  v_ok_count INT;
BEGIN
  PERFORM dblink_connect('conn1', 'host=db port=5432 dbname=postgres user=postgres password=postgres');
  PERFORM dblink_connect('conn2', 'host=db port=5432 dbname=postgres user=postgres password=postgres');

  PERFORM dblink_exec('conn1', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn1', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000050","role":"authenticated"}'$q$);
  PERFORM dblink_exec('conn2', 'SET ROLE authenticated');
  PERFORM dblink_exec('conn2', $q$SET request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000051","role":"authenticated"}'$q$);

  -- Dispatch both calls asynchronously before collecting either result, so
  -- they race on the advisory lock exactly as they would in production.
  PERFORM dblink_send_query('conn1', $q$SELECT leave_household()$q$);
  PERFORM dblink_send_query('conn2', $q$SELECT leave_household()$q$);

  SELECT res INTO v_r1 FROM dblink_get_result('conn1') AS t(res JSONB);
  SELECT res INTO v_r2 FROM dblink_get_result('conn2') AS t(res JSONB);
  PERFORM dblink_get_result('conn1'); -- drain end-of-results marker
  PERFORM dblink_get_result('conn2');

  PERFORM dblink_disconnect('conn1');
  PERFORM dblink_disconnect('conn2');

  SELECT (CASE WHEN (v_r1->>'ok')::boolean THEN 1 ELSE 0 END) + (CASE WHEN (v_r2->>'ok')::boolean THEN 1 ELSE 0 END) INTO v_ok_count;
  IF v_ok_count <> 2 THEN
    RAISE EXCEPTION 'FAIL LEAVE.CONCURRENT: expected both concurrent calls to succeed cleanly (no deadlock), got % successes (r1=%, r2=%)', v_ok_count, v_r1, v_r2;
  END IF;

  SELECT EXISTS (SELECT 1 FROM households WHERE id = '55555555-5555-5555-5555-555555555555') INTO v_household_exists;
  IF v_household_exists THEN
    RAISE EXCEPTION 'FAIL LEAVE.CONCURRENT: household still exists after both members left (r1=%, r2=%)', v_r1, v_r2;
  END IF;

  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f0000000-0000-0000-0000-000000000050') INTO v_user1_exists;
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f0000000-0000-0000-0000-000000000051') INTO v_user2_exists;
  IF NOT v_user1_exists OR NOT v_user2_exists THEN
    RAISE EXCEPTION 'FAIL LEAVE.CONCURRENT: expected both users'' auth.users rows to survive (leave must never delete an account), got user1=%, user2=%', v_user1_exists, v_user2_exists;
  END IF;

  RAISE NOTICE 'PASS LEAVE.CONCURRENT: two concurrent leave_household() calls from the two members of the same household => no deadlock, both succeed, household fully gone, both users'' accounts survive intact (r1=%, r2=%)', v_r1, v_r2;
END $$;

-- Cleanup — real DELETEs, in case any assertion above failed partway and
-- left something behind (the happy path already leaves no household/
-- membership rows to clean — only the two auth.users rows this section
-- created, which the happy path deliberately leaves intact).
DELETE FROM household_members WHERE household_id = '55555555-5555-5555-5555-555555555555';
DELETE FROM households WHERE id = '55555555-5555-5555-5555-555555555555';
DELETE FROM auth.users WHERE id IN ('f0000000-0000-0000-0000-000000000050', 'f0000000-0000-0000-0000-000000000051');

DO $$ BEGIN RAISE NOTICE '=== ALL RLS TESTS PASSED (main transaction + 5.9 + ADR-020-race + RECURRING.CONCURRENT + DELETE_ACCOUNT.CONCURRENT + LEAVE.CONCURRENT) ==='; END $$;
