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
-- Migration 008 (internal account transfers, ADR-035) adds Group 9:
-- create_transfer()/update_transfer()/delete_transfer() correctness,
-- household isolation, and admin-gating on delete; the RLS tightening on
-- transactions_insert/_update/_delete that forces every transfer-leg write
-- through those RPCs (9.7-9.10 prove the direct-mutation-bypass regressions
-- design-stage review found are closed); the transfers table's SELECT-only
-- grant; and the leave_household()/delete_own_account() widening that nulls
-- transfers.created_by for a departing member.
-- Migration 009 (optimistic concurrency protection, ADR-036) adds Group 10:
-- version-column compare-and-swap correctness for planned_obligations/
-- recurring_transactions/savings_goals — update/status/progress/delete RPC
-- success and stale-write/stale-delete => conflict, household isolation
-- (no oracle), version monotonicity, and the RLS-closure + grant-narrowing
-- proof that a direct client UPDATE/DELETE bypass is rejected for the two
-- RLS-closed tables. recurring_transactions' UPDATE stays open by design
-- (its own generate_recurring_transactions()/skip_recurring_occurrence()
-- depend on it), enforced instead by a BEFORE UPDATE trigger — 10.24-10.26
-- prove both of its rules independently, including the unconditional-rule
-- regression design-stage review required fixed, and 10.30-10.31 prove the
-- two system functions' own writes are never blocked by it.
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

-- Migration 007 (planned_obligations) fixtures — a Household-2 row is
-- required for every cross-household isolation assertion below to be
-- non-vacuous, same reasoning as every other financial table above.
INSERT INTO planned_obligations (id, household_id, name, amount_agorot, due_date, category_id, account_id, status, created_by) VALUES
  ('58000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'ארנונה בית 1', 180000, '2026-09-10', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'upcoming', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('58000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'ארנונה בית 2', 190000, '2026-09-10', '5c000000-0000-0000-0000-000000000002', '5a000000-0000-0000-0000-000000000002', 'upcoming', 'cccccccc-cccc-cccc-cccc-cccccccccccc');

-- Migration 008 (internal transfers, ADR-035) fixtures — a second account
-- per household, since a transfer needs two distinct accounts. Every Group 9
-- test below needs at least one of these; kept as permanent top-level
-- fixtures (like every other financial fixture above) rather than local to
-- one test, since multiple sub-tests reuse them.
INSERT INTO accounts (id, household_id, owner_id, name, type) VALUES
  ('5a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', NULL, 'חשבון חיסכון בית 1', 'savings'),
  ('5a000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', NULL, 'חשבון חיסכון בית 2', 'savings');

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
-- Migration 007 — OBLIGATIONS.*: planned_obligations RLS, D2 coherence,
-- CHECK constraints, and the leave_household()/delete_own_account()
-- attribution-nulling addition. Grouped under its own namespace (same
-- convention as SAVINGS.TRIGGER.* for migration 003) rather than
-- interleaved into the 1.x/2.x/D2.x numbering above, since this table did
-- not exist when those were numbered.
-- ============================================================================

-- OBLIGATIONS.ISOLATION.1: User A cannot SELECT Household 2 planned_obligations.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM planned_obligations WHERE household_id = '22222222-2222-2222-2222-222222222222';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL OBLIGATIONS.ISOLATION.1: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('OBLIGATIONS.ISOLATION.1', 'User A cannot SELECT Household 2 planned_obligations');
END $$;
RESET role;

-- OBLIGATIONS.ISOLATION.2: User D (no household) SELECTs planned_obligations => 0 rows.
DO $$
DECLARE v_count INT;
BEGIN
  SET LOCAL role = authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';
  SELECT count(*) INTO v_count FROM planned_obligations;
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL OBLIGATIONS.ISOLATION.2: expected 0 rows, got %', v_count; END IF;
  PERFORM _pass('OBLIGATIONS.ISOLATION.2', 'User D (no household) SELECTs planned_obligations => 0 rows');
END $$;
RESET role;

-- OBLIGATIONS.INSERT.1 (positive): User A creates a Household 1 planned
-- obligation with a household category/account => succeeds.
SAVEPOINT sp_obl_insert_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, category_id, account_id, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'ביטוח רכב', 420000, '2026-11-15', '5c000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL OBLIGATIONS.INSERT.1: expected 1 row inserted, got %', v_rows; END IF;
  PERFORM _pass('OBLIGATIONS.INSERT.1', 'a household member can create a planned obligation with a household category/account');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_insert_1;

-- OBLIGATIONS.INSERT.2: User A attempts to INSERT with household_id =
-- Household 2 (not a member) => rejected.
SAVEPOINT sp_obl_insert_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, created_by)
    VALUES ('22222222-2222-2222-2222-222222222222', 'התחזות לבית זר', 100000, '2026-11-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.INSERT.2: a non-member was able to create an obligation for Household 2';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('OBLIGATIONS.INSERT.2', 'a user cannot create a planned obligation for a household they do not belong to');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_insert_2;

-- OBLIGATIONS.D2.1: category_id pointing at Household 2's custom category => rejected.
SAVEPOINT sp_obl_d2_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, category_id, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'עם קטגוריה זרה', 100000, '2026-11-15', '5c000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.D2.1: obligation with a cross-household category_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('OBLIGATIONS.D2.1', 'planned_obligations.category_id pointing at another household''s category is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_d2_1;

-- OBLIGATIONS.D2.2 (positive): category_id pointing at a SYSTEM category (household_id IS NULL) => succeeds.
SAVEPOINT sp_obl_d2_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT; v_system_category_id UUID;
BEGIN
  SELECT id INTO v_system_category_id FROM categories WHERE household_id IS NULL LIMIT 1;
  INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, category_id, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'עם קטגוריית מערכת', 100000, '2026-11-15', v_system_category_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL OBLIGATIONS.D2.2: expected 1 row inserted referencing a system category, got %', v_rows; END IF;
  PERFORM _pass('OBLIGATIONS.D2.2', 'planned_obligations.category_id can reference a system category');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_d2_2;

-- OBLIGATIONS.D2.3: account_id pointing at Household 2's account => rejected.
SAVEPOINT sp_obl_d2_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, account_id, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'עם חשבון זר', 100000, '2026-11-15', '5a000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.D2.3: obligation with a cross-household account_id was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('OBLIGATIONS.D2.3', 'planned_obligations.account_id pointing at another household''s account is rejected');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_d2_3;

-- OBLIGATIONS.D2.4: created_by set to a different user on INSERT => rejected (must equal auth.uid()).
SAVEPOINT sp_obl_d2_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'עם created_by זר', 100000, '2026-11-15', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.D2.4: User A inserted an obligation attributed to User B';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('OBLIGATIONS.D2.4', 'planned_obligations.created_by must equal the inserting user on INSERT');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_d2_4;

-- OBLIGATIONS.UPDATE.1 (co-editing): User B (partner, did not create the
-- fixture obligation) marks the Household 1 obligation as completed =>
-- succeeds. Migration 009 (ADR-036) closed planned_obligations' direct
-- UPDATE path entirely — this now goes through set_planned_obligation_status()
-- (database-security-reviewer finding: the pre-009 version of this test did
-- a raw UPDATE, which migration 009 turns into an unconditional
-- insufficient_privilege failure that would abort the whole suite under
-- -v ON_ERROR_STOP=1).
SAVEPOINT sp_obl_update_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT set_planned_obligation_status('58000000-0000-0000-0000-000000000001'::uuid, 1, 'completed') INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL OBLIGATIONS.UPDATE.1: expected ok, got %', v_result;
  END IF;
  PERFORM _pass('OBLIGATIONS.UPDATE.1', 'any household member can mark an obligation completed via set_planned_obligation_status(), including one they did not create');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_update_1;

-- OBLIGATIONS.D2.UPDATE: User A attempts to update the Household 1 fixture
-- obligation's category_id to point at Household 2's custom category =>
-- rejected. Migration 009 moves this coherence check from
-- planned_obligations_update's WITH CHECK into update_planned_obligation()
-- itself (database-security-reviewer finding: keeping this test as a raw
-- UPDATE would still incidentally "pass" — insufficient_privilege now covers
-- ANY direct UPDATE, RLS-WITH-CHECK-shaped or not — but would no longer
-- exercise the D2 coherence check the RPC itself performs, so a real
-- regression there would go undetected).
SAVEPOINT sp_obl_d2_update;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1,
    'ארנונה בית 1', 180000, '2026-09-10'::date,
    '5c000000-0000-0000-0000-000000000002'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    TRUE, NULL
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_category' THEN
    RAISE EXCEPTION 'FAIL OBLIGATIONS.D2.UPDATE: expected invalid_category for a cross-household category_id, got %', v_result;
  END IF;
  PERFORM _pass('OBLIGATIONS.D2.UPDATE', 'update_planned_obligation() rejects a category_id from another household, not just create-time INSERT coherence');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_d2_update;

-- OBLIGATIONS.DELETE.1: any household member can delete a planned
-- obligation, via delete_planned_obligation() (migration 009 closed the
-- direct DELETE path — same reasoning as OBLIGATIONS.UPDATE.1 above).
SAVEPOINT sp_obl_delete_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL OBLIGATIONS.DELETE.1: expected ok, got %', v_result;
  END IF;
  PERFORM _pass('OBLIGATIONS.DELETE.1', 'any household member can delete a planned obligation via delete_planned_obligation(), including one they did not create');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_delete_1;

-- OBLIGATIONS.CHECK.1: amount_agorot <= 0 => rejected by the CHECK constraint.
SAVEPOINT sp_obl_check_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'סכום שגוי', 0, '2026-11-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.CHECK.1: a zero amount_agorot was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM _pass('OBLIGATIONS.CHECK.1', 'amount_agorot <= 0 is rejected by the CHECK constraint');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_check_1;

-- OBLIGATIONS.CHECK.2: an invalid status value => rejected by the CHECK constraint.
SAVEPOINT sp_obl_check_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, status, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', 'סטטוס שגוי', 100000, '2026-11-15', 'not_a_real_status', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL OBLIGATIONS.CHECK.2: an invalid status value was accepted';
  EXCEPTION WHEN check_violation THEN
    PERFORM _pass('OBLIGATIONS.CHECK.2', 'an invalid status value is rejected by the CHECK constraint');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_check_2;

-- OBLIGATIONS.CHECK.3 (positive): status = 'cancelled' is accepted (the
-- optional third status the task names alongside upcoming/completed).
SAVEPOINT sp_obl_check_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_rows INT;
BEGIN
  INSERT INTO planned_obligations (household_id, name, amount_agorot, due_date, status, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'מבוטל', 100000, '2026-11-15', 'cancelled', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'FAIL OBLIGATIONS.CHECK.3: expected 1 row inserted with status=cancelled, got %', v_rows; END IF;
  PERFORM _pass('OBLIGATIONS.CHECK.3', 'status=cancelled is a valid, accepted value');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_obl_check_3;

-- OBLIGATIONS.LEAVE.1: proves migration 007's addition to leave_household()
-- actually nulls planned_obligations.created_by for a departing member of a
-- CONTINUING (multi-member) household — the one branch with no auth.users
-- deletion to fall back on. User B leaves Household 1 (User A remains); the
-- fixture obligation was created by User A, so this exercises "some other
-- member's row is untouched" implicitly, and a fresh row created by B
-- (inserted here, inside this same savepoint, so it exists to null) proves
-- the actual nulling.
SAVEPOINT sp_obl_leave_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO planned_obligations (id, household_id, name, amount_agorot, due_date, created_by)
  VALUES ('58000000-0000-0000-0000-000000000099', '11111111-1111-1111-1111-111111111111', 'התחייבות של B', 50000, '2026-11-15', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
END $$;

DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL OBLIGATIONS.LEAVE.1: expected ok:true for User B leaving Household 1, got %', v_result;
  END IF;
END $$;
RESET role;

DO $$
DECLARE v_created_by UUID;
BEGIN
  SELECT created_by INTO v_created_by
  FROM planned_obligations
  WHERE id = '58000000-0000-0000-0000-000000000099';
  IF v_created_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL OBLIGATIONS.LEAVE.1: expected created_by to be nulled after the creator left the household, got %', v_created_by;
  END IF;
  PERFORM _pass('OBLIGATIONS.LEAVE.1', 'leave_household() nulls planned_obligations.created_by for the departing member''s own rows, keeping the household''s data intact');
END $$;
ROLLBACK TO SAVEPOINT sp_obl_leave_1;

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

-- SAVINGS.TRIGGER.2: migration 009 (ADR-036) closed savings_goals' direct
-- UPDATE path entirely, so "a client-supplied is_completed=false on UPDATE"
-- is no longer merely overridden — it is impossible to attempt at all
-- (insufficient_privilege, proven independently by 10.13). What survives to
-- test here: update_savings_goal_progress() — the only legitimate write
-- path for current_agorot, and one that never accepts an is_completed
-- parameter in the first place — still derives is_completed=true correctly
-- when current_agorot >= target_agorot (database-security-reviewer finding:
-- the pre-009 version of this test did a raw UPDATE, which now aborts the
-- whole suite under -v ON_ERROR_STOP=1).
SAVEPOINT sp_savings_trigger_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_goal_id UUID; v_result JSONB;
BEGIN
  INSERT INTO savings_goals (household_id, name, target_agorot, current_agorot, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'SAVINGS.TRIGGER.2', 100000, 40000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_goal_id;

  BEGIN
    UPDATE savings_goals SET is_completed = FALSE WHERE id = v_goal_id;
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.2: a direct UPDATE on savings_goals was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT update_savings_goal_progress(v_goal_id, 1, 100000) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR NOT (v_result->>'isCompleted')::boolean THEN
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.2: expected the trigger to derive is_completed=true via update_savings_goal_progress(), got %', v_result;
  END IF;
  PERFORM _pass('SAVINGS.TRIGGER.2', 'a direct UPDATE attempting is_completed=false is rejected at the grant level, and the only legitimate write path (update_savings_goal_progress()) still correctly derives is_completed=true when current_agorot >= target_agorot');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_savings_trigger_2;

-- SAVINGS.TRIGGER.3: a normal progress update via update_savings_goal_
-- progress() (current_agorot only — the RPC has no is_completed parameter
-- at all) correctly derives is_completed on crossing.
SAVEPOINT sp_savings_trigger_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_goal_id UUID; v_result JSONB;
BEGIN
  INSERT INTO savings_goals (household_id, name, target_agorot, current_agorot, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', 'SAVINGS.TRIGGER.3', 100000, 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  RETURNING id INTO v_goal_id;

  SELECT update_savings_goal_progress(v_goal_id, 1, 100000) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR NOT (v_result->>'isCompleted')::boolean THEN
    RAISE EXCEPTION 'FAIL SAVINGS.TRIGGER.3: expected is_completed=true after current_agorot reached target, got %', v_result;
  END IF;
  PERFORM _pass('SAVINGS.TRIGGER.3', 'is_completed is correctly derived true when update_savings_goal_progress() reaches target');
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

-- ============================================================================
-- Group 9 — Internal account transfers (migration 008, ADR-035)
-- ============================================================================
-- create_transfer()/update_transfer()/delete_transfer() correctness and
-- authorization, plus the RLS tightening on transactions_insert/_update/
-- _delete that forces every transfer-leg write through those three RPCs.
-- 9.7-9.10 are the direct-mutation-bypass regressions the design-stage
-- review found before this migration was written (see migration
-- 008_internal_transfers.sql's own header) — proven closed here, not merely
-- asserted. 9.5's anon-cannot-execute and the fixed-search_path guarantee
-- for all three RPCs are additionally covered for free by the existing
-- generic 6.5/6.6 structural guards below (they scan every SECURITY DEFINER
-- function in public, not just the ones existing at the time those guards
-- were written), so no redundant per-function search_path/grant test is
-- duplicated here.

-- 9.1: create_transfer() as an authenticated household member creates
-- exactly one transfers row and two correctly-signed transaction legs, both
-- with category_id NULL and transfer_id set to the new transfer's id.
SAVEPOINT sp_9_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE
  v_result JSONB;
  v_transfer_id UUID;
  v_leg_count INT;
  v_source_count INT;
  v_dest_count INT;
BEGIN
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid,
    '5a000000-0000-0000-0000-000000000003'::uuid,
    50000,
    '2026-08-15'::date,
    'העברה לחיסכון'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 9.1: create_transfer failed, got %', v_result;
  END IF;
  v_transfer_id := (v_result->>'transfer_id')::uuid;

  SELECT COUNT(*) INTO v_leg_count FROM transactions WHERE transfer_id = v_transfer_id;
  IF v_leg_count <> 2 THEN
    RAISE EXCEPTION 'FAIL 9.1: expected exactly 2 linked transaction legs, got %', v_leg_count;
  END IF;

  SELECT COUNT(*) INTO v_source_count FROM transactions
    WHERE transfer_id = v_transfer_id AND account_id = '5a000000-0000-0000-0000-000000000001'
      AND amount_agorot = -50000 AND category_id IS NULL;
  SELECT COUNT(*) INTO v_dest_count FROM transactions
    WHERE transfer_id = v_transfer_id AND account_id = '5a000000-0000-0000-0000-000000000003'
      AND amount_agorot = 50000 AND category_id IS NULL;
  IF v_source_count <> 1 OR v_dest_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 9.1: legs not correctly signed/linked (source=%, dest=%)', v_source_count, v_dest_count;
  END IF;

  PERFORM _pass('9.1', 'create_transfer() creates one transfers row and two correctly-signed, category-less linked transaction legs');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_1;

-- 9.2: same from/to account => same_account, nothing inserted.
SAVEPOINT sp_9_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_count INT;
BEGIN
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    10000, '2026-08-15'::date, 'לא חוקי'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'same_account' THEN
    RAISE EXCEPTION 'FAIL 9.2: expected same_account error, got %', v_result;
  END IF;
  SELECT COUNT(*) INTO v_count FROM transfers WHERE description = 'לא חוקי';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 9.2: a transfer row was inserted despite the rejected call'; END IF;
  PERFORM _pass('9.2', 'create_transfer() rejects an identical from/to account with same_account, nothing inserted');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_2;

-- 9.3: an account from the OTHER household => invalid_account, nothing
-- inserted. Proves create_transfer cannot be used to move money into or out
-- of a household the caller does not belong to.
SAVEPOINT sp_9_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_count INT;
BEGIN
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000002'::uuid,
    10000, '2026-08-15'::date, 'חוצה בתים'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_account' THEN
    RAISE EXCEPTION 'FAIL 9.3: expected invalid_account error for a cross-household destination, got %', v_result;
  END IF;
  SELECT COUNT(*) INTO v_count FROM transfers WHERE description = 'חוצה בתים';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL 9.3: a transfer row was inserted despite the rejected call'; END IF;
  PERFORM _pass('9.3', 'create_transfer() rejects a to_account_id belonging to a different household, nothing inserted');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_3;

-- 9.4: non-positive amount => invalid_amount.
SAVEPOINT sp_9_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
    0, '2026-08-15'::date, 'סכום אפס'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_amount' THEN
    RAISE EXCEPTION 'FAIL 9.4: expected invalid_amount for a zero amount, got %', v_result;
  END IF;
  PERFORM _pass('9.4', 'create_transfer() rejects a non-positive amount with invalid_amount');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_4;

-- 9.5: anon cannot EXECUTE create_transfer.
SAVEPOINT sp_9_5;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM create_transfer(
      '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
      10000, '2026-08-15'::date, 'לא רלוונטי'
    );
    RAISE EXCEPTION 'FAIL 9.5: anon was able to call create_transfer';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('9.5', 'anon cannot EXECUTE create_transfer');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_5;

-- 9.6: a real transfer, created once and reused by 9.7-9.18 below (each
-- sub-test runs in its own SAVEPOINT nested inside this one, so none of
-- their attempted mutations persist into the next). Its identity is
-- stashed via set_config/current_setting — LOCAL to this transaction, so it
-- survives each nested savepoint's own ROLLBACK TO SAVEPOINT the same way
-- the fixture row itself does (that rollback only undoes changes made AFTER
-- the nested savepoint, not this one) — rather than a TEMP TABLE, which
-- would need an explicit GRANT to be writable while impersonating
-- authenticated (it would otherwise be owned by postgres with no privileges
-- extended to other roles, unlike _pass()'s SECURITY DEFINER escape hatch).
SAVEPOINT sp_9_fixture;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_transfer_id UUID;
BEGIN
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
    50000, '2026-08-15'::date, 'העברה קבועה לבדיקות'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'setup for Group 9 fixture transfer failed: %', v_result;
  END IF;
  v_transfer_id := (v_result->>'transfer_id')::uuid;
  PERFORM set_config('g9.transfer_id', v_transfer_id::text, true);
  PERFORM set_config('g9.source_leg_id', (SELECT id::text FROM transactions WHERE transfer_id = v_transfer_id AND amount_agorot < 0), true);
  PERFORM set_config('g9.dest_leg_id', (SELECT id::text FROM transactions WHERE transfer_id = v_transfer_id AND amount_agorot > 0), true);
END $$;
RESET role;

-- 9.7 [MUST-FIX regression, database-security-reviewer]: a direct client
-- INSERT into transactions with transfer_id set is rejected by
-- transactions_insert's tightened WITH CHECK — a transfer leg can only ever
-- be created by create_transfer().
SAVEPOINT sp_9_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  BEGIN
    INSERT INTO transactions (household_id, account_id, transfer_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', v_transfer_id, -1000, 'עוקף', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL 9.7: a direct INSERT with transfer_id set was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM _pass('9.7', 'a direct client INSERT with transfer_id set is rejected — only create_transfer() may create a transfer leg');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_7;

-- 9.8 [MUST-FIX regression, architecture-reviewer + database-security-
-- reviewer]: the core finding from design-stage review. A direct UPDATE
-- attempting to detach a leg from its transfer (SET transfer_id = NULL) —
-- previously only blocked by WITH CHECK, which the reviewers proved
-- insufficient on its own. transactions_update's USING clause now also
-- requires transfer_id IS NULL on the OLD row, so this leg is not even a
-- reachable UPDATE target: 0 rows affected, not a rejected-but-attempted
-- write.
SAVEPOINT sp_9_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_source_leg_id UUID; v_rows INT;
BEGIN
  v_source_leg_id := current_setting('g9.source_leg_id')::uuid;
  UPDATE transactions SET transfer_id = NULL, amount_agorot = -999999 WHERE id = v_source_leg_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 9.8: a direct UPDATE detached and mutated a transfer leg — % row(s) affected', v_rows;
  END IF;
  PERFORM _pass('9.8', 'a direct UPDATE attempting to detach a leg (transfer_id = NULL) and change its amount in the same statement affects 0 rows — the exact bypass the design-stage review found and required fixed before this migration shipped');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_8;

-- 9.9: a direct UPDATE that leaves transfer_id untouched (just changes the
-- amount) is equally rejected — proves the USING-clause fix blocks ANY
-- direct mutation of a transfer leg, not only ones that touch transfer_id.
SAVEPOINT sp_9_9;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_source_leg_id UUID; v_rows INT;
BEGIN
  v_source_leg_id := current_setting('g9.source_leg_id')::uuid;
  UPDATE transactions SET description = 'שינוי ישיר' WHERE id = v_source_leg_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 9.9: a direct UPDATE that never touches transfer_id still mutated a transfer leg — % row(s) affected', v_rows;
  END IF;
  PERFORM _pass('9.9', 'a direct UPDATE to a transfer leg is rejected even when it never touches transfer_id itself — the leg is simply not a reachable UPDATE target');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_9;

-- 9.10: a direct DELETE on a transfer leg via the ordinary admin-only
-- transactions_delete policy is rejected — only delete_transfer() may
-- remove a transfer (and it always removes both legs together).
SAVEPOINT sp_9_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_source_leg_id UUID; v_rows INT;
BEGIN
  v_source_leg_id := current_setting('g9.source_leg_id')::uuid;
  DELETE FROM transactions WHERE id = v_source_leg_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL 9.10: a direct admin DELETE removed one leg of a transfer without the other — % row(s) affected', v_rows;
  END IF;
  PERFORM _pass('9.10', 'a direct DELETE on a transfer leg (even by an admin) is rejected — only delete_transfer() can remove a transfer, always both legs together');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_10;

-- 9.11: cross-household SELECT isolation on the transfers table itself.
SAVEPOINT sp_9_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_count INT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT COUNT(*) INTO v_count FROM transfers WHERE id = v_transfer_id;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 9.11: User C (household 2) could see household 1''s transfer row';
  END IF;
  PERFORM _pass('9.11', 'a member of a different household cannot SELECT another household''s transfers row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_11;

-- 9.12: update_transfer() on a transfer belonging to a DIFFERENT household
-- => not_found, not a silent no-op success and not a cross-household write.
SAVEPOINT sp_9_12;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT update_transfer(
    v_transfer_id, '5a000000-0000-0000-0000-000000000002'::uuid, '5a000000-0000-0000-0000-000000000004'::uuid,
    99999, '2026-08-16'::date, 'ניסיון חוצה בתים'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 9.12: expected not_found for a cross-household transfer id, got %', v_result;
  END IF;
  PERFORM _pass('9.12', 'update_transfer() on another household''s transfer_id reports not_found, never a cross-household write');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_12;

-- 9.13: update_transfer() with an account substitution from a DIFFERENT
-- household, on the caller's OWN transfer => invalid_account, nothing
-- changed (proves the household-membership check applies to update, not
-- only create).
SAVEPOINT sp_9_13;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB; v_desc TEXT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT update_transfer(
    v_transfer_id, '5a000000-0000-0000-0000-000000000002'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
    60000, '2026-08-16'::date, 'ניסיון חשבון זר'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_account' THEN
    RAISE EXCEPTION 'FAIL 9.13: expected invalid_account for a cross-household from_account_id, got %', v_result;
  END IF;
  SELECT description INTO v_desc FROM transfers WHERE id = v_transfer_id;
  IF v_desc <> 'העברה קבועה לבדיקות' THEN
    RAISE EXCEPTION 'FAIL 9.13: the transfer was mutated despite the rejected call, description is now %', v_desc;
  END IF;
  PERFORM _pass('9.13', 'update_transfer() rejects a from_account_id belonging to a different household, nothing changed');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_13;

-- 9.14: update_transfer() with the same from/to account => same_account,
-- nothing changed.
SAVEPOINT sp_9_14;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT update_transfer(
    v_transfer_id, '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    60000, '2026-08-16'::date, 'לא חוקי'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'same_account' THEN
    RAISE EXCEPTION 'FAIL 9.14: expected same_account, got %', v_result;
  END IF;
  PERFORM _pass('9.14', 'update_transfer() rejects an identical from/to account with same_account');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_14;

-- 9.15: a successful update_transfer() rewrites the transfers row and both
-- legs together — new amount, new accounts, new description, both legs
-- still correctly signed and still linked to the same transfer_id.
SAVEPOINT sp_9_15;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB; v_source_count INT; v_dest_count INT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  -- Swaps the direction (source<->dest) as part of the same update, proving
  -- the sign-based leg selection in update_transfer() (WHERE amount_agorot
  -- < 0 / > 0, evaluated against each leg's CURRENT amount before this
  -- statement changes it) correctly re-targets both legs even when which
  -- account is "source" changes.
  SELECT update_transfer(
    v_transfer_id, '5a000000-0000-0000-0000-000000000003'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    75000, '2026-08-20'::date, 'עודכן'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 9.15: update_transfer failed, got %', v_result;
  END IF;

  SELECT COUNT(*) INTO v_source_count FROM transactions
    WHERE transfer_id = v_transfer_id AND account_id = '5a000000-0000-0000-0000-000000000003'
      AND amount_agorot = -75000 AND txn_date = '2026-08-20' AND description = 'עודכן';
  SELECT COUNT(*) INTO v_dest_count FROM transactions
    WHERE transfer_id = v_transfer_id AND account_id = '5a000000-0000-0000-0000-000000000001'
      AND amount_agorot = 75000 AND txn_date = '2026-08-20' AND description = 'עודכן';
  IF v_source_count <> 1 OR v_dest_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 9.15: legs not correctly rewritten after a direction-swapping update (source=%, dest=%)', v_source_count, v_dest_count;
  END IF;
  PERFORM _pass('9.15', 'update_transfer() atomically rewrites the transfers row and both legs, including correctly re-targeting each leg when the from/to direction is swapped');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_15;

-- 9.16: delete_transfer() by a non-admin member => not_admin, nothing
-- deleted.
SAVEPOINT sp_9_16;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB; v_count INT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT delete_transfer(v_transfer_id) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_admin' THEN
    RAISE EXCEPTION 'FAIL 9.16: expected not_admin for a non-admin member, got %', v_result;
  END IF;
  SELECT COUNT(*) INTO v_count FROM transfers WHERE id = v_transfer_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 9.16: the transfer was deleted despite the rejected call'; END IF;
  PERFORM _pass('9.16', 'delete_transfer() rejects a non-admin household member with not_admin, nothing deleted');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_16;

-- 9.17: delete_transfer() on a transfer belonging to a DIFFERENT household
-- => not_found, even for that OTHER household's own admin (household
-- isolation, not merely a role check).
SAVEPOINT sp_9_17;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT delete_transfer(v_transfer_id) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 9.17: expected not_found for a cross-household transfer id (even from an admin), got %', v_result;
  END IF;
END $$;
RESET role;
-- Verify persistence as postgres, not while impersonating User C:
-- transfers_select correctly hides Household 1 from User C, so a
-- COUNT(*) performed above would always be 0 even when the row still
-- exists and would turn this isolation test into a false deletion
-- alarm (same superuser post-check pattern used by 5.14 and others).
DO $$
DECLARE v_transfer_id UUID; v_count INT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT COUNT(*) INTO v_count FROM transfers WHERE id = v_transfer_id;
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL 9.17: the transfer was deleted by another household''s admin'; END IF;
  PERFORM _pass('9.17', 'delete_transfer() on another household''s transfer_id reports not_found and the transfer remains intact');
END $$;
ROLLBACK TO SAVEPOINT sp_9_17;

-- 9.18: delete_transfer() by the OWNING household's admin removes the
-- transfers row and both linked legs atomically (ON DELETE CASCADE), in
-- one statement.
SAVEPOINT sp_9_18;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB; v_transfer_count INT; v_leg_count INT;
BEGIN
  v_transfer_id := current_setting('g9.transfer_id')::uuid;
  SELECT delete_transfer(v_transfer_id) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 9.18: delete_transfer failed for the owning household''s admin, got %', v_result;
  END IF;
  SELECT COUNT(*) INTO v_transfer_count FROM transfers WHERE id = v_transfer_id;
  SELECT COUNT(*) INTO v_leg_count FROM transactions WHERE transfer_id = v_transfer_id;
  IF v_transfer_count <> 0 OR v_leg_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 9.18: transfer or its legs survived deletion (transfer=%, legs=%)', v_transfer_count, v_leg_count;
  END IF;
  PERFORM _pass('9.18', 'delete_transfer() by the owning household''s admin atomically removes the transfers row and both legs via ON DELETE CASCADE');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_18;

ROLLBACK TO SAVEPOINT sp_9_fixture;

-- 9.19: transfers' own table grant is SELECT-only for authenticated — no
-- INSERT/UPDATE/DELETE grant, matching its policy (SELECT-only, no
-- mutation policy exists at all) exactly rather than relying on RLS alone
-- to deny what a wider grant would permit.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'transfers' AND grantee = 'authenticated'
    AND privilege_type <> 'SELECT';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9.19: transfers is granted % to authenticated, expected SELECT only', v_bad;
  END IF;
  SELECT string_agg(privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'transfers' AND grantee = 'anon';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9.19: transfers is granted % to anon, expected nothing', v_bad;
  END IF;
  PERFORM _pass('9.19', 'transfers table grant is SELECT-only for authenticated and nothing for anon, matching its SELECT-only policy exactly');
END $$;

-- 9.20: leave_household() nulls transfers.created_by for a departing
-- member in a continuing household — mirrors OBLIGATIONS.LEAVE.1's pattern
-- for the identical reason (RLS's WITH CHECK reads current
-- household_members membership; a departed member's row must not leave a
-- dangling FK pointing at someone no longer in the household).
SAVEPOINT sp_9_20;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';
DO $$
DECLARE v_transfer_id UUID; v_result JSONB;
BEGIN
  -- User B (member) creates a transfer, then leaves — User A (admin)
  -- remains, so this is the continuing-household branch, not the
  -- sole-member cascade.
  SELECT create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
    20000, '2026-08-15'::date, 'העברה של משתמש עוזב'
  ) INTO v_result;
  v_transfer_id := (v_result->>'transfer_id')::uuid;

  SELECT leave_household() INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'setup for 9.20 failed: leave_household() returned %', v_result;
  END IF;

  IF EXISTS (SELECT 1 FROM transfers WHERE id = v_transfer_id AND created_by IS NOT NULL) THEN
    RAISE EXCEPTION 'FAIL 9.20: transfers.created_by still points at the departed member';
  END IF;
  PERFORM _pass('9.20', 'leave_household() nulls transfers.created_by for the departing member''s own rows, keeping the transfer itself intact');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_9_20;

-- 9.21: transfers.created_by's ON DELETE SET NULL, tested directly against
-- the raw FK constraint rather than through delete_own_account() — that
-- RPC's own explicit "UPDATE transfers SET created_by = NULL ..." (§9.20's
-- continuing-household branch) would null the same column regardless of
-- what the FK's ON DELETE behavior is, masking a missing or wrong FK
-- definition. Deleting the auth.users row directly, decoupled from any RPC,
-- isolates exactly what this migration changed: present from this
-- migration's first version (unlike recurring_transactions.created_by/
-- savings_goals.created_by, which needed a migration 004 retrofit after
-- shipping without it) so delete_own_account() never regresses into a raw
-- foreign_key_violation for a user who ever created a transfer.
SAVEPOINT sp_9_21;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  PERFORM create_transfer(
    '5a000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000003'::uuid,
    30000, '2026-08-15'::date, 'העברה למבחן FK'
  );
END $$;
RESET role;

DO $$
DECLARE v_transfer_id UUID; v_created_by UUID;
BEGIN
  SELECT id INTO v_transfer_id FROM transfers WHERE description = 'העברה למבחן FK';
  DELETE FROM auth.users WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT created_by INTO v_created_by FROM transfers WHERE id = v_transfer_id;
  IF v_created_by IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 9.21: transfers.created_by is still %, expected NULL', v_created_by;
  END IF;
  PERFORM _pass('9.21', 'deleting the auth.users row a transfer''s created_by references does not raise a foreign_key_violation -- transfers.created_by has ON DELETE SET NULL from this migration''s first version, and the transfer itself survives intact');
END $$;
ROLLBACK TO SAVEPOINT sp_9_21;

-- ============================================================================
-- Group 10 — Optimistic concurrency protection (migration 009, ADR-036)
-- ============================================================================
-- planned_obligations/savings_goals: update/status/delete RPC correctness,
-- household isolation (no oracle: cross-household + correct version still
-- => not_found), direct-UPDATE/DELETE bypass rejected at the grant level
-- (not merely by RLS), stale-write and stale-delete => conflict with no
-- data/version change, version monotonicity. recurring_transactions: the
-- deliberate asymmetry — UPDATE stays open, enforced instead by
-- enforce_recurring_transaction_version()'s two rules (10.24-10.26 prove
-- both independently, including the unconditional-rule regression the
-- design-stage review required fixed before this migration shipped), DELETE
-- closed the same way as the other two tables, and a positive-path proof
-- that generate_recurring_transactions()/skip_recurring_occurrence()'s own
-- writes are never blocked. 10.32b/10.32c prove anon cannot EXECUTE the two
-- SECURITY INVOKER recurring RPCs (functional coverage of what 6.6 would
-- give a SECURITY DEFINER function for free); 10.34/10.35 cover fixed
-- search_path for those same two RPCs plus the trigger function, and the
-- trigger function's own zero-EXECUTE-grants posture — none of which Group
-- 6's 6.5/6.6 structural guards reach (they scan only SECURITY DEFINER
-- functions).

-- 10.1: update_planned_obligation() as the owning household's member —
-- version 1 -> 2, data changes.
SAVEPOINT sp_10_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1,
    'ארנונה מעודכנת', 185000, '2026-09-15'::date,
    '5c000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    TRUE, 'הערה'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 10.1: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM planned_obligations
    WHERE id = '58000000-0000-0000-0000-000000000001' AND name = 'ארנונה מעודכנת' AND amount_agorot = 185000 AND version = 2
  ) THEN
    RAISE EXCEPTION 'FAIL 10.1: row was not actually updated to the new values/version';
  END IF;
  PERFORM _pass('10.1', 'update_planned_obligation() with the correct expected_version applies the update and advances version 1 -> 2');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_1;

-- 10.2: same call with a stale expected_version (still 1 after someone else
-- already bumped it) => conflict, data AND version left completely
-- unchanged — the core invariant of this whole milestone.
SAVEPOINT sp_10_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  -- First save advances version to 2 (simulates the "other device/user").
  PERFORM update_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1,
    'עדכון ראשון', 185000, '2026-09-15'::date,
    '5c000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    TRUE, NULL
  );
  -- Second save is still based on the version-1 snapshot it loaded.
  SELECT update_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1,
    'עדכון שני (מיושן)', 999900, '2026-12-31'::date,
    '5c000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-0000-0000-000000000001'::uuid,
    TRUE, NULL
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.2: expected conflict for a stale expected_version, got %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM planned_obligations
    WHERE id = '58000000-0000-0000-0000-000000000001' AND name = 'עדכון ראשון' AND version = 2
  ) THEN
    RAISE EXCEPTION 'FAIL 10.2: the stale (rejected) write leaked through — row is not exactly as the first, successful write left it';
  END IF;
  PERFORM _pass('10.2', 'update_planned_obligation() with a stale expected_version returns conflict and leaves the row''s data and version completely untouched — a stale client can never silently overwrite a newer version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_2;

-- 10.3: Household 2's admin calling update_planned_obligation() on
-- Household 1's obligation, with the CORRECT current version, still gets
-- not_found — no oracle distinguishing "wrong household" from "does not
-- exist" (same discipline ADR-010 already established for invitations).
SAVEPOINT sp_10_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1,
    'ניסיון חציית בתים', 100000, '2026-09-15'::date,
    NULL, NULL, TRUE, NULL
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 10.3: expected not_found for a cross-household id+correct-version call, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND name = 'ניסיון חציית בתים') THEN
    RAISE EXCEPTION 'FAIL 10.3: a member of the OTHER household was able to mutate this obligation';
  END IF;
  PERFORM _pass('10.3', 'update_planned_obligation() called by a different household''s member, even with the correct current version, returns not_found and mutates nothing — expected_version cannot be used to bypass household isolation');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_3;

-- 10.4: a direct client UPDATE on planned_obligations is rejected at the
-- GRANT level (insufficient_privilege) — not merely "the app doesn't call
-- it anymore." planned_obligations_update was DROP-ed and the table grant
-- narrowed to SELECT, INSERT only.
SAVEPOINT sp_10_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    UPDATE planned_obligations SET name = 'עוקף' WHERE id = '58000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 10.4: a direct UPDATE on planned_obligations was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.4', 'a direct client UPDATE on planned_obligations is rejected at the grant level — update_planned_obligation()/set_planned_obligation_status() are the only write paths');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_4;

-- 10.5: same for a direct DELETE.
SAVEPOINT sp_10_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    DELETE FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 10.5: a direct DELETE on planned_obligations was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.5', 'a direct client DELETE on planned_obligations is rejected at the grant level — delete_planned_obligation() is the only delete path');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_5;

-- 10.6: delete_planned_obligation() with a stale expected_version =>
-- conflict, row survives untouched.
SAVEPOINT sp_10_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 99) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.6: expected conflict for a stale delete, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.6: the obligation was deleted despite a stale expected_version';
  END IF;
  PERFORM _pass('10.6', 'delete_planned_obligation() with a stale expected_version returns conflict and does not delete the row — a stale client can never silently remove a newer version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_6;

-- 10.7: delete_planned_obligation() with the correct version succeeds.
SAVEPOINT sp_10_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 10.7: expected ok for a correctly-versioned delete, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.7: the obligation still exists after a successful delete';
  END IF;
  PERFORM _pass('10.7', 'delete_planned_obligation() with the correct expected_version deletes the row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_7;

-- 10.8: set_planned_obligation_status() — the mark-paid/cancel one-tap
-- action — succeeds and advances version; an invalid status is rejected
-- cleanly (no raw constraint exception) and leaves version untouched.
SAVEPOINT sp_10_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT set_planned_obligation_status('58000000-0000-0000-0000-000000000001'::uuid, 1, 'completed') INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 10.8a: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'completed' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.8a: status/version not actually updated';
  END IF;

  SELECT set_planned_obligation_status('58000000-0000-0000-0000-000000000001'::uuid, 2, 'not_a_real_status') INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_status' THEN
    RAISE EXCEPTION 'FAIL 10.8b: expected a clean invalid_status error, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.8b: version changed despite the rejected invalid status';
  END IF;
  PERFORM _pass('10.8', 'set_planned_obligation_status(): a valid status advances version 1 -> 2; an invalid status is rejected with a clean {ok:false} result, not a raw constraint exception, and leaves version untouched');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_8;

-- 10.9: version monotonicity — three successive correctly-versioned updates
-- advance 1 -> 2 -> 3, never resetting or skipping.
SAVEPOINT sp_10_9;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, 'א', 100000, '2026-09-01'::date, NULL, NULL, TRUE, NULL) INTO v_result;
  IF (v_result->>'version')::bigint <> 2 THEN RAISE EXCEPTION 'FAIL 10.9: expected version 2 after first update, got %', v_result; END IF;

  SELECT update_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 2, 'ב', 100000, '2026-09-01'::date, NULL, NULL, TRUE, NULL) INTO v_result;
  IF (v_result->>'version')::bigint <> 3 THEN RAISE EXCEPTION 'FAIL 10.9: expected version 3 after second update, got %', v_result; END IF;

  PERFORM _pass('10.9', 'three successive correctly-versioned updates advance version 1 -> 2 -> 3, strictly monotonic');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_9;

-- 10.10: update_savings_goal() — version 1 -> 2, data changes.
SAVEPOINT sp_10_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד מעודכן', 150000, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, NULL, NULL
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 10.10: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001' AND name = 'יעד מעודכן' AND target_agorot = 150000 AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.10: row was not actually updated';
  END IF;
  PERFORM _pass('10.10', 'update_savings_goal() with the correct expected_version applies the update and advances version 1 -> 2');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_10;

-- 10.11: stale update_savings_goal() => conflict, unchanged.
SAVEPOINT sp_10_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  PERFORM update_savings_goal('59000000-0000-0000-0000-000000000001'::uuid, 1, 'עדכון ראשון', 150000, NULL, NULL, NULL, NULL);
  SELECT update_savings_goal('59000000-0000-0000-0000-000000000001'::uuid, 1, 'עדכון מיושן', 999900, NULL, NULL, NULL, NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.11: expected conflict for a stale expected_version, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001' AND name = 'עדכון ראשון' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.11: the stale write leaked through';
  END IF;
  PERFORM _pass('10.11', 'update_savings_goal() with a stale expected_version returns conflict and leaves the row untouched');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_11;

-- 10.12: cross-household update_savings_goal() with the correct version =>
-- not_found, no oracle.
SAVEPOINT sp_10_12;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal('59000000-0000-0000-0000-000000000001'::uuid, 1, 'חציית בתים', 100000, NULL, NULL, NULL, NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 10.12: expected not_found for a cross-household id+correct-version call, got %', v_result;
  END IF;
  PERFORM _pass('10.12', 'update_savings_goal() called by a different household''s member returns not_found even with the correct current version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_12;

-- 10.13/10.14: direct UPDATE/DELETE on savings_goals rejected at the grant level.
SAVEPOINT sp_10_13;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    UPDATE savings_goals SET name = 'עוקף' WHERE id = '59000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 10.13: a direct UPDATE on savings_goals was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.13', 'a direct client UPDATE on savings_goals is rejected at the grant level');
  END;
  BEGIN
    DELETE FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 10.14: a direct DELETE on savings_goals was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.14', 'a direct client DELETE on savings_goals is rejected at the grant level');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_13;

-- 10.15: update_savings_goal_progress() crossing the completion threshold —
-- returns currentAgorot/isCompleted/version together (the shape
-- useUpdateSavingsGoalProgress.ts's goal.completed/goal.progress_updated
-- transition detection depends on), and derive_savings_goal_completion()
-- (migration 003) still fires inside the same statement.
SAVEPOINT sp_10_15;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal_progress('59000000-0000-0000-0000-000000000001'::uuid, 1, 100000) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2
     OR (v_result->>'currentAgorot')::bigint <> 100000 OR NOT (v_result->>'isCompleted')::boolean THEN
    RAISE EXCEPTION 'FAIL 10.15: expected ok/version=2/currentAgorot=100000/isCompleted=true, got %', v_result;
  END IF;
  PERFORM _pass('10.15', 'update_savings_goal_progress() returns version/currentAgorot/isCompleted together, and derive_savings_goal_completion() still derives is_completed correctly inside the same statement');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_15;

-- 10.16: stale update_savings_goal_progress() => conflict.
SAVEPOINT sp_10_16;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  PERFORM update_savings_goal_progress('59000000-0000-0000-0000-000000000001'::uuid, 1, 50000);
  SELECT update_savings_goal_progress('59000000-0000-0000-0000-000000000001'::uuid, 1, 999900) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.16: expected conflict for a stale expected_version, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001' AND current_agorot = 50000 AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.16: the stale progress write leaked through';
  END IF;
  PERFORM _pass('10.16', 'update_savings_goal_progress() with a stale expected_version returns conflict and does not apply');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_16;

-- 10.17/10.18: delete_savings_goal() — stale => conflict, survives; correct
-- version => succeeds.
SAVEPOINT sp_10_17;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_savings_goal('59000000-0000-0000-0000-000000000001'::uuid, 99) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.17: expected conflict for a stale delete, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.17: the goal was deleted despite a stale expected_version';
  END IF;
  PERFORM _pass('10.17', 'delete_savings_goal() with a stale expected_version returns conflict and does not delete the row');

  SELECT delete_savings_goal('59000000-0000-0000-0000-000000000001'::uuid, 1) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 10.18: expected ok for a correctly-versioned delete, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.18: the goal still exists after a successful delete';
  END IF;
  PERFORM _pass('10.18', 'delete_savings_goal() with the correct expected_version deletes the row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_17;

-- 10.19: update_recurring_transaction() — SECURITY INVOKER, relies on the
-- still-open recurring_update RLS for household scoping, adding only the
-- version compare-and-swap. Version 1 -> 2, data changes.
SAVEPOINT sp_10_19;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_recurring_transaction(
    '5e000000-0000-0000-0000-000000000001'::uuid, 1,
    '5a000000-0000-0000-0000-000000000001'::uuid, '5c000000-0000-0000-0000-000000000001'::uuid,
    -6000, 'הו״ק מעודכן', TRUE, 'monthly', NULL
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 10.19: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND amount_agorot = -6000 AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.19: row was not actually updated';
  END IF;
  PERFORM _pass('10.19', 'update_recurring_transaction() with the correct expected_version applies the update and advances version 1 -> 2, via the RLS-scoped SECURITY INVOKER RPC');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_19;

-- 10.20: stale update_recurring_transaction() => conflict.
SAVEPOINT sp_10_20;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  PERFORM update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, -6000, 'עדכון ראשון', TRUE, 'monthly', NULL);
  SELECT update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, -999900, 'עדכון מיושן', TRUE, 'monthly', NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.20: expected conflict for a stale expected_version, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND description = 'עדכון ראשון' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.20: the stale write leaked through';
  END IF;
  PERFORM _pass('10.20', 'update_recurring_transaction() with a stale expected_version returns conflict and leaves the row untouched');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_20;

-- 10.21: cross-household update_recurring_transaction() with the correct
-- version => not_found, no oracle (same guarantee as the two DEFINER RPCs,
-- proven independently here since this RPC derives household membership
-- itself rather than relying solely on RLS row visibility for the WHERE
-- clause).
SAVEPOINT sp_10_21;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000002'::uuid, NULL, -6000, 'חציית בתים', TRUE, 'monthly', NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 10.21: expected not_found for a cross-household id+correct-version call, got %', v_result;
  END IF;
  PERFORM _pass('10.21', 'update_recurring_transaction() called by a different household''s member returns not_found even with the correct current version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_21;

-- 10.22: update_recurring_transaction() rejects an invalid frequency/day_of_
-- month/account with a clean {ok:false} result rather than a raw
-- constraint/RLS exception (the gap this migration's own self-review found
-- and fixed before the design-stage review even ran).
SAVEPOINT sp_10_22;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, -6000, 'תדירות לא חוקית', TRUE, 'not_a_real_frequency', NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_frequency' THEN
    RAISE EXCEPTION 'FAIL 10.22a: expected a clean invalid_frequency error, got %', v_result;
  END IF;

  SELECT update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000002'::uuid, NULL, -6000, 'חשבון בית אחר', TRUE, 'monthly', NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_account' THEN
    RAISE EXCEPTION 'FAIL 10.22b: expected a clean invalid_account error for a cross-household account_id, got %', v_result;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND version = 1) THEN
    RAISE EXCEPTION 'FAIL 10.22: version advanced despite both rejected calls';
  END IF;
  PERFORM _pass('10.22', 'update_recurring_transaction() rejects an invalid frequency and a cross-household account_id with clean {ok:false} results, never a raw Postgres exception, and never advances version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_22;

-- 10.23: set_recurring_transaction_active() — pause/resume — succeeds and
-- advances version; stale call => conflict.
SAVEPOINT sp_10_23;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT set_recurring_transaction_active('5e000000-0000-0000-0000-000000000001'::uuid, 1, FALSE) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 10.23a: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND is_active = FALSE AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.23a: is_active/version not actually updated';
  END IF;

  SELECT set_recurring_transaction_active('5e000000-0000-0000-0000-000000000001'::uuid, 1, TRUE) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.23b: expected conflict for a stale expected_version, got %', v_result;
  END IF;
  PERFORM _pass('10.23', 'set_recurring_transaction_active() advances version on success and returns conflict for a stale expected_version');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_23;

-- 10.24: enforce_recurring_transaction_version() conditional rule — a
-- direct client UPDATE that changes a protected column (amount_agorot)
-- WITHOUT incrementing version is rejected.
SAVEPOINT sp_10_24;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE recurring_transactions SET amount_agorot = -9999 WHERE id = '5e000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN raise_exception THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'FAIL 10.24: a direct UPDATE changing amount_agorot without incrementing version was NOT rejected';
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND amount_agorot = -9999) THEN
    RAISE EXCEPTION 'FAIL 10.24: the rejected write leaked through despite the exception';
  END IF;
  PERFORM _pass('10.24', 'enforce_recurring_transaction_version(): a protected-column change with version left unchanged is rejected (conditional rule)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_24;

-- 10.25: positive control — a direct client UPDATE that changes a protected
-- column AND correctly increments version by exactly 1 succeeds. Proves
-- recurring_transactions' UPDATE is legitimately reachable directly (the
-- deliberate asymmetry vs. the other two tables), not merely "currently
-- unused by the app."
SAVEPOINT sp_10_25;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  UPDATE recurring_transactions SET amount_agorot = -9999, version = version + 1 WHERE id = '5e000000-0000-0000-0000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND amount_agorot = -9999 AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.25: a correctly-versioned direct UPDATE did not apply';
  END IF;
  PERFORM _pass('10.25', 'a direct UPDATE that changes a protected column and correctly increments version by 1 succeeds — recurring_transactions'' UPDATE RLS is intentionally still open, unlike the other two tables');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_25;

-- 10.26: enforce_recurring_transaction_version() unconditional rule — the
-- specific regression design-stage review required fixed. First a
-- legitimate update bumps version to 2; then a direct UPDATE attempts to
-- roll version BACKWARD to 1 while touching NO protected column at all. A
-- purely conditional check (only validating version when a protected column
-- changes) would let this through untouched; the unconditional rule closes
-- it.
SAVEPOINT sp_10_26;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_caught BOOLEAN := FALSE;
BEGIN
  UPDATE recurring_transactions SET description = 'עדכון לגיטימי', version = version + 1 WHERE id = '5e000000-0000-0000-0000-000000000001';

  BEGIN
    UPDATE recurring_transactions SET version = 1 WHERE id = '5e000000-0000-0000-0000-000000000001';
  EXCEPTION WHEN raise_exception THEN
    v_caught := TRUE;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'FAIL 10.26: a direct UPDATE rolling version backward with no protected column touched was NOT rejected — the unconditional-rule regression';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 10.26: version is not 2 after the rejected rollback attempt';
  END IF;
  PERFORM _pass('10.26', 'enforce_recurring_transaction_version(): version cannot be rolled backward even when no protected column is touched — the unconditional rule catches what a purely conditional check would miss, matching this migration''s header/ADR-036 §5');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_26;

-- 10.27: a direct DELETE on recurring_transactions is rejected at the grant
-- level — no competing writer for delete on this table either, so it is
-- closed exactly like the other two.
SAVEPOINT sp_10_27;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    DELETE FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 10.27: a direct DELETE on recurring_transactions was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.27', 'a direct client DELETE on recurring_transactions is rejected at the grant level — delete_recurring_transaction() is the only delete path, even though UPDATE stays open');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_27;

-- 10.28/10.29: delete_recurring_transaction() — stale => conflict, survives;
-- correct version => succeeds.
SAVEPOINT sp_10_28;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT delete_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 99) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 10.28: expected conflict for a stale delete, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.28: the template was deleted despite a stale expected_version';
  END IF;
  PERFORM _pass('10.28', 'delete_recurring_transaction() with a stale expected_version returns conflict and does not delete the row');

  SELECT delete_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 10.29: expected ok for a correctly-versioned delete, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM recurring_transactions WHERE id = '5e000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 10.29: the template still exists after a successful delete';
  END IF;
  PERFORM _pass('10.29', 'delete_recurring_transaction() with the correct expected_version deletes the row');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_28;

-- 10.30/10.31: positive-path proof that generate_recurring_transactions()
-- and skip_recurring_occurrence()'s own next_due_date/last_generated_at
-- writes are never blocked by enforce_recurring_transaction_version() —
-- neither function ever touches version, so it stays at 1 (NEW.version =
-- OLD.version trivially satisfies the unconditional rule; neither function
-- touches a protected column, so the conditional rule never fires either).
SAVEPOINT sp_10_30;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_id UUID := '5e100000-0000-0000-0000-000000000001'; v_result JSONB; v_version BIGINT; v_new_due DATE;
BEGIN
  INSERT INTO recurring_transactions (id, household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES (v_id, '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1000, 'תבנית למבחן 10.30', 'daily', CURRENT_DATE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  SELECT generate_recurring_transactions() INTO v_result;

  SELECT version, next_due_date INTO v_version, v_new_due FROM recurring_transactions WHERE id = v_id;
  IF v_version <> 1 THEN
    RAISE EXCEPTION 'FAIL 10.30: generate_recurring_transactions() own write was blocked or altered version — expected 1, got %', v_version;
  END IF;
  IF v_new_due <> CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'FAIL 10.30: next_due_date did not advance as expected, got %', v_new_due;
  END IF;
  PERFORM _pass('10.30', 'generate_recurring_transactions() own next_due_date/last_generated_at write is never blocked by enforce_recurring_transaction_version() — version stays untouched at 1');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_30;

SAVEPOINT sp_10_31;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_id UUID := '5e100000-0000-0000-0000-000000000002'; v_result JSONB; v_version BIGINT; v_new_due DATE;
BEGIN
  INSERT INTO recurring_transactions (id, household_id, account_id, category_id, amount_agorot, description, frequency, next_due_date, created_by)
  VALUES (v_id, '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', -1000, 'תבנית למבחן 10.31', 'daily', CURRENT_DATE, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

  SELECT skip_recurring_occurrence(v_id) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 10.31: skip_recurring_occurrence() failed, got %', v_result;
  END IF;

  SELECT version, next_due_date INTO v_version, v_new_due FROM recurring_transactions WHERE id = v_id;
  IF v_version <> 1 THEN
    RAISE EXCEPTION 'FAIL 10.31: skip_recurring_occurrence() own write was blocked or altered version — expected 1, got %', v_version;
  END IF;
  IF v_new_due <> CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'FAIL 10.31: next_due_date did not advance as expected, got %', v_new_due;
  END IF;
  PERFORM _pass('10.31', 'skip_recurring_occurrence() own next_due_date write is never blocked by enforce_recurring_transaction_version() — version stays untouched at 1');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_31;

-- 10.32: anon cannot EXECUTE any of the new version-aware RPCs (DEFINER or
-- INVOKER alike).
SAVEPOINT sp_10_32;
SET LOCAL role = anon;
DO $$
BEGIN
  BEGIN
    PERFORM update_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, 'x', 100, '2026-09-01'::date, NULL, NULL, TRUE, NULL);
    RAISE EXCEPTION 'FAIL 10.32a: anon was able to call update_planned_obligation';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.32a', 'anon cannot EXECUTE update_planned_obligation');
  END;
  BEGIN
    PERFORM update_recurring_transaction('5e000000-0000-0000-0000-000000000001'::uuid, 1, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, -100, 'x', TRUE, 'monthly', NULL);
    RAISE EXCEPTION 'FAIL 10.32b: anon was able to call update_recurring_transaction';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.32b', 'anon cannot EXECUTE update_recurring_transaction (SECURITY INVOKER is not a lesser guarantee — EXECUTE is still revoked from anon/PUBLIC exactly like every DEFINER RPC)');
  END;
  BEGIN
    PERFORM set_recurring_transaction_active('5e000000-0000-0000-0000-000000000001'::uuid, 1, FALSE);
    RAISE EXCEPTION 'FAIL 10.32c: anon was able to call set_recurring_transaction_active';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM _pass('10.32c', 'anon cannot EXECUTE set_recurring_transaction_active');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_10_32;

-- 10.33: planned_obligations/savings_goals table grants are exactly SELECT,
-- INSERT for authenticated — no UPDATE/DELETE, nothing for anon — proving
-- the REVOKE ALL actually ran before the narrower re-GRANT (an additive-only
-- GRANT SELECT, INSERT without a preceding REVOKE would leave the old
-- broader grant silently intact; 10.4/10.5/10.13/10.14 already prove the
-- practical consequence, this proves the grant catalog itself is exactly
-- right, not merely "narrow enough to fail those specific statements").
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(table_name || ':' || privilege_type, ', ') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name IN ('planned_obligations', 'savings_goals')
    AND grantee = 'authenticated' AND privilege_type NOT IN ('SELECT', 'INSERT');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10.33a: planned_obligations/savings_goals granted more than SELECT,INSERT to authenticated: %', v_bad;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name IN ('planned_obligations', 'savings_goals')
    AND grantee IN ('anon', 'PUBLIC');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10.33b: planned_obligations/savings_goals granted something to anon/PUBLIC: %', v_bad;
  END IF;

  SELECT string_agg(privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'recurring_transactions'
    AND grantee = 'authenticated' AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10.33c: recurring_transactions granted more than SELECT,INSERT,UPDATE to authenticated: %', v_bad;
  END IF;

  SELECT string_agg(privilege_type, ',') INTO v_bad
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'recurring_transactions' AND grantee IN ('anon', 'PUBLIC');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10.33d: recurring_transactions granted something to anon/PUBLIC: %', v_bad;
  END IF;

  PERFORM _pass('10.33', 'planned_obligations/savings_goals are granted exactly SELECT,INSERT to authenticated and nothing to anon/PUBLIC; recurring_transactions is granted exactly SELECT,INSERT,UPDATE to authenticated and nothing to anon/PUBLIC — the REVOKE ALL before each narrower re-GRANT actually took effect');
END $$;

-- 10.34: search_path is fixed for the two SECURITY INVOKER recurring RPCs
-- and the trigger function — Group 6's 6.5/6.6 structural guards only scan
-- prosecdef = TRUE (SECURITY DEFINER) functions, so these three are not
-- automatically covered by that generic sweep.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(proname, ',') INTO v_bad
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('update_recurring_transaction', 'set_recurring_transaction_active', 'enforce_recurring_transaction_version')
    AND (proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%'));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL 10.34: functions without a fixed search_path: %', v_bad;
  END IF;
  PERFORM _pass('10.34', 'update_recurring_transaction()/set_recurring_transaction_active()/enforce_recurring_transaction_version() all have a fixed search_path, even though none is SECURITY DEFINER and so none is covered by Group 6''s 6.5 sweep');
END $$;

-- 10.35: enforce_recurring_transaction_version() has zero direct EXECUTE
-- grants to any role — it is trigger-only, exactly like migration 003's
-- derive_savings_goal_completion(), never meant to be called directly.
DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM information_schema.role_routine_grants
  WHERE routine_schema = 'public' AND routine_name = 'enforce_recurring_transaction_version';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL 10.35: enforce_recurring_transaction_version has % direct EXECUTE grant(s), expected 0 (trigger-only)', v_count;
  END IF;
  PERFORM _pass('10.35', 'enforce_recurring_transaction_version() has zero direct EXECUTE grants — callable only as a trigger, never directly');
END $$;

-- ============================================================================
-- Group 11 — Obligation-to-transaction linkage (migration 012)
-- ============================================================================
-- complete_planned_obligation() correctness (transaction creation, optional
-- skip, account validation, CAS, cross-household oracle avoidance), the
-- obligation_id RLS hard-block (mirroring transfer_id's treatment — 11.7/
-- 11.8 are the direct-mutation-bypass regressions design-stage review found
-- and required fixed before this migration was written), the
-- set_planned_obligation_status() reversion guard and its own oracle-
-- avoidance scoping, and ON DELETE SET NULL. Anon-cannot-execute and fixed-
-- search_path for complete_planned_obligation() are covered for free by the
-- existing generic 6.5/6.6 structural guards below (they scan every
-- SECURITY DEFINER function in public dynamically), so not duplicated here.

-- 11.1: complete_planned_obligation() with p_create_transaction = TRUE, as
-- the owning household's member — obligation completes (version 1 -> 2) and
-- exactly one correctly-populated linked transaction is inserted.
SAVEPOINT sp_11_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_txn_id UUID; v_txn_count INT;
BEGIN
  SELECT complete_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE,
    '5a000000-0000-0000-0000-000000000001'::uuid
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 11.1: expected ok with version 2, got %', v_result;
  END IF;
  v_txn_id := (v_result->>'transaction_id')::uuid;
  IF v_txn_id IS NULL THEN
    RAISE EXCEPTION 'FAIL 11.1: expected a transaction_id in the result, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'completed' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 11.1: obligation was not actually marked completed/version 2';
  END IF;
  SELECT count(*) INTO v_txn_count FROM transactions WHERE obligation_id = '58000000-0000-0000-0000-000000000001';
  IF v_txn_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 11.1: expected exactly 1 linked transaction, got %', v_txn_count;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM transactions
    WHERE id = v_txn_id AND obligation_id = '58000000-0000-0000-0000-000000000001'
      AND amount_agorot = -180000 AND category_id = '5c000000-0000-0000-0000-000000000001'
      AND account_id = '5a000000-0000-0000-0000-000000000001' AND is_shared = TRUE
      AND description = 'ארנונה בית 1' AND txn_date = CURRENT_DATE AND source = 'manual'
  ) THEN
    RAISE EXCEPTION 'FAIL 11.1: linked transaction fields do not match the obligation it was created from';
  END IF;
  PERFORM _pass('11.1', 'complete_planned_obligation() with p_create_transaction=TRUE completes the obligation and inserts exactly one correctly-populated, linked expense transaction (negative amount, obligation''s own category/is_shared/name, today''s date)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_1;

-- 11.2: p_create_transaction = TRUE with no p_account_id => missing_account,
-- nothing inserted, obligation untouched.
SAVEPOINT sp_11_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'missing_account' THEN
    RAISE EXCEPTION 'FAIL 11.2: expected missing_account, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'upcoming' AND version = 1) THEN
    RAISE EXCEPTION 'FAIL 11.2: obligation was mutated despite the rejected call';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE obligation_id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 11.2: a transaction was inserted despite the rejected call';
  END IF;
  PERFORM _pass('11.2', 'complete_planned_obligation() with p_create_transaction=TRUE and no account rejects with missing_account, mutating nothing');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_2;

-- 11.3: p_account_id from a DIFFERENT household => invalid_account, nothing
-- mutated. This function is SECURITY DEFINER (bypasses RLS for its own
-- writes), so this in-function check is the only thing preventing a
-- cross-household account from being used.
SAVEPOINT sp_11_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT complete_planned_obligation(
    '58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE,
    '5a000000-0000-0000-0000-000000000002'::uuid
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_account' THEN
    RAISE EXCEPTION 'FAIL 11.3: expected invalid_account for a cross-household account, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'upcoming' AND version = 1) THEN
    RAISE EXCEPTION 'FAIL 11.3: obligation was mutated despite the rejected call';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE obligation_id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 11.3: a transaction was inserted despite the rejected call';
  END IF;
  PERFORM _pass('11.3', 'complete_planned_obligation() rejects an account belonging to a different household with invalid_account, mutating nothing');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_3;

-- 11.4: p_create_transaction = FALSE — obligation completes, but NO
-- transaction is ever inserted.
SAVEPOINT sp_11_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, FALSE, NULL) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 OR v_result->'transaction_id' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'FAIL 11.4: expected ok/version 2/null transaction_id, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'completed' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 11.4: obligation was not marked completed/version 2';
  END IF;
  IF EXISTS (SELECT 1 FROM transactions WHERE obligation_id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 11.4: a transaction was inserted despite p_create_transaction=FALSE';
  END IF;
  PERFORM _pass('11.4', 'complete_planned_obligation() with p_create_transaction=FALSE completes the obligation without ever inserting a transaction');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_4;

-- 11.5: a stale expected_version (after a first, successful call already
-- advanced it) => conflict; the obligation and its one linked transaction
-- from the first call are left completely untouched — no second transaction
-- is ever inserted for the same obligation.
SAVEPOINT sp_11_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_txn_count INT;
BEGIN
  PERFORM complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, '5a000000-0000-0000-0000-000000000001'::uuid);

  SELECT complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, '5a000000-0000-0000-0000-000000000001'::uuid) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'conflict' THEN
    RAISE EXCEPTION 'FAIL 11.5: expected conflict for a stale/already-completed obligation, got %', v_result;
  END IF;
  SELECT count(*) INTO v_txn_count FROM transactions WHERE obligation_id = '58000000-0000-0000-0000-000000000001';
  IF v_txn_count <> 1 THEN
    RAISE EXCEPTION 'FAIL 11.5: expected exactly 1 linked transaction after the rejected second call, got %', v_txn_count;
  END IF;
  PERFORM _pass('11.5', 'complete_planned_obligation() called twice on the same obligation returns conflict the second time and never creates a second linked transaction — an already-completed row cannot be marked paid again');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_5;

-- 11.6: Household 2's member calling complete_planned_obligation() on
-- Household 1's obligation, with the CORRECT current version, still gets
-- not_found — no oracle distinguishing "wrong household" from "does not
-- exist" (same discipline already established for update_planned_obligation
-- in 10.3).
SAVEPOINT sp_11_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, FALSE, NULL) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 11.6: expected not_found for a cross-household id+correct-version call, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status <> 'upcoming') THEN
    RAISE EXCEPTION 'FAIL 11.6: a member of the OTHER household was able to mutate this obligation';
  END IF;
  PERFORM _pass('11.6', 'complete_planned_obligation() called by a different household''s member, even with the correct current version, returns not_found and mutates nothing');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_6;

-- 11.7 [design-stage review finding]: a direct client INSERT into
-- transactions with obligation_id set is rejected by transactions_insert's
-- tightened WITH CHECK — a linked transaction can only ever be created by
-- complete_planned_obligation().
SAVEPOINT sp_11_7;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO transactions (household_id, account_id, obligation_id, amount_agorot, description, txn_date, created_by)
    VALUES ('11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001', '58000000-0000-0000-0000-000000000001', -1000, 'עוקף', '2026-08-15', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    RAISE EXCEPTION 'FAIL 11.7: a direct INSERT with obligation_id set was allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM _pass('11.7', 'a direct client INSERT with obligation_id set is rejected — only complete_planned_obligation() may create a linked transaction');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_7;

-- 11.8 [design-stage review finding]: a direct client UPDATE attempting to
-- set obligation_id on an ordinary, already-existing transaction (whose
-- obligation_id is currently NULL) is rejected — but NOT via a silent
-- 0-row no-op the way 9.8/9.9's DETACH direction is (transfer_id going
-- non-null -> NULL fails transactions_update's USING clause on the OLD row,
-- so the row is never even selected). This is the opposite, ATTACH
-- direction: the OLD row's obligation_id IS NULL, so USING passes and the
-- row IS selected — it's the NEW row's obligation_id (now non-null) that
-- fails WITH CHECK, which Postgres raises as an explicit RLS-violation
-- exception rather than silently affecting 0 rows. Both directions are
-- fully blocked; only the failure shape differs, matching 11.7's own
-- exception-catching style (same underlying WITH CHECK violation), not
-- 9.8/9.9's ROW_COUNT-based one.
SAVEPOINT sp_11_8;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  BEGIN
    UPDATE transactions SET obligation_id = '58000000-0000-0000-0000-000000000001' WHERE id = '5f000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'FAIL 11.8: a direct UPDATE linked an ordinary transaction to an obligation';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    PERFORM _pass('11.8', 'a direct client UPDATE attempting to set obligation_id on an ordinary transaction is rejected (WITH CHECK violation on the new row) — only complete_planned_obligation() may link a transaction to an obligation');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_8;

-- 11.9 [database-security-reviewer finding]: once complete_planned_obligation()
-- has linked a transaction, set_planned_obligation_status() refuses to
-- change that obligation's status at all — reverting it to 'upcoming' would
-- silently reintroduce a double-count (the real transaction stays on the
-- books, but the obligation would be counted again by Safe-to-Spend/
-- cash-flow forecast).
SAVEPOINT sp_11_9;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  PERFORM complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, '5a000000-0000-0000-0000-000000000001'::uuid);

  SELECT set_planned_obligation_status('58000000-0000-0000-0000-000000000001'::uuid, 2, 'upcoming') INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'has_linked_transaction' THEN
    RAISE EXCEPTION 'FAIL 11.9: expected has_linked_transaction when reverting a transaction-linked obligation, got %', v_result;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001' AND status = 'completed' AND version = 2) THEN
    RAISE EXCEPTION 'FAIL 11.9: the obligation''s status/version changed despite the rejected call';
  END IF;
  PERFORM _pass('11.9', 'set_planned_obligation_status() refuses to change the status of an obligation that already has a linked transaction, leaving it completely untouched');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_9;

-- 11.10 [database-security-reviewer re-verification finding]: the
-- has_linked_transaction guard is scoped by household_id — a member of a
-- DIFFERENT household calling set_planned_obligation_status() on a
-- transaction-linked obligation that isn't theirs still gets not_found, not
-- has_linked_transaction. Without this, the choice between the two error
-- codes would let any authenticated user learn that a foreign household's
-- obligation exists and is completed-with-a-linked-transaction.
SAVEPOINT sp_11_10;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  PERFORM complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, '5a000000-0000-0000-0000-000000000001'::uuid);
END $$;
RESET role;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT set_planned_obligation_status('58000000-0000-0000-0000-000000000001'::uuid, 2, 'upcoming') INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'not_found' THEN
    RAISE EXCEPTION 'FAIL 11.10: expected not_found (not has_linked_transaction) for a foreign household''s transaction-linked obligation, got %', v_result;
  END IF;
  PERFORM _pass('11.10', 'set_planned_obligation_status()''s has_linked_transaction guard is scoped by household_id — a foreign household''s member gets not_found, byte-identical to an id that does not exist, never has_linked_transaction');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_10;

-- 11.11 [database-security-reviewer finding]: delete_planned_obligation() on
-- a completed obligation with a linked transaction succeeds cleanly — the
-- transaction survives with obligation_id set to NULL (ON DELETE SET NULL),
-- never a raw, unhandled FK-violation exception.
SAVEPOINT sp_11_11;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_complete_result JSONB; v_delete_result JSONB; v_txn_id UUID;
BEGIN
  SELECT complete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 1, TRUE, '5a000000-0000-0000-0000-000000000001'::uuid) INTO v_complete_result;
  v_txn_id := (v_complete_result->>'transaction_id')::uuid;

  SELECT delete_planned_obligation('58000000-0000-0000-0000-000000000001'::uuid, 2) INTO v_delete_result;
  IF NOT (v_delete_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 11.11: expected ok deleting a completed, transaction-linked obligation, got %', v_delete_result;
  END IF;
  IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = '58000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL 11.11: the obligation still exists after a successful delete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transactions WHERE id = v_txn_id AND obligation_id IS NULL) THEN
    RAISE EXCEPTION 'FAIL 11.11: the linked transaction did not survive with obligation_id set to NULL';
  END IF;
  PERFORM _pass('11.11', 'delete_planned_obligation() on a completed, transaction-linked obligation succeeds cleanly (ON DELETE SET NULL) — the real transaction record survives, only the provenance link is lost');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_11_11;

-- ============================================================================
-- Group 12 — Savings goal progress source (manual vs. linked_account,
-- migration 015). Product decision under test: a goal's progress is either
-- 'manual' (unchanged default/behavior) or 'linked_account' (derived from
-- the linked account's balance client-side); at most one goal may have a
-- given account as its linked_account source at a time, enforced both in
-- update_savings_goal() (a clean error code) and by a partial unique index
-- (defense in depth against a direct INSERT bypassing the RPC).
-- ============================================================================

-- 12.1: update_savings_goal() with progress_source='linked_account' and no
-- account_id is rejected — "use the linked account's balance" needs an
-- account to read.
SAVEPOINT sp_12_1;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד חיסכון בית 1', 100000, NULL, NULL, NULL, NULL, 'linked_account'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'linked_account_requires_account' THEN
    RAISE EXCEPTION 'FAIL 12.1: expected linked_account_requires_account, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001' AND version <> 1) THEN
    RAISE EXCEPTION 'FAIL 12.1: version changed despite the rejected update';
  END IF;
  PERFORM _pass('12.1', 'update_savings_goal() rejects progress_source=linked_account with no account_id (linked_account_requires_account), row untouched');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_1;

-- 12.2: update_savings_goal() with progress_source='linked_account' and a
-- valid, unused account_id succeeds and persists both columns.
SAVEPOINT sp_12_2;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד חיסכון בית 1', 100000, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, NULL, NULL, 'linked_account'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean OR (v_result->>'version')::bigint <> 2 THEN
    RAISE EXCEPTION 'FAIL 12.2: expected ok with version 2, got %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM savings_goals
    WHERE id = '59000000-0000-0000-0000-000000000001' AND progress_source = 'linked_account'
      AND account_id = '5a000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL 12.2: progress_source/account_id were not actually persisted';
  END IF;
  PERFORM _pass('12.2', 'update_savings_goal() with progress_source=linked_account and a valid, unused account_id succeeds and persists both');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_2;

-- 12.3: "do not automatically assign its full balance to multiple goals" —
-- linking a second goal's progress to an account already linked to another
-- goal is rejected with a clean, catchable error, and neither row changes.
SAVEPOINT sp_12_3;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB; v_second_goal_id UUID;
BEGIN
  SELECT update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד חיסכון בית 1', 100000, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, NULL, NULL, 'linked_account'
  ) INTO v_result;
  IF NOT (v_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL 12.3 setup: expected linking goal 1 to succeed, got %', v_result;
  END IF;

  -- INSERT is still directly grantable (migration 009) — a second
  -- household-1 goal, still 'manual' at creation, pointing descriptively at
  -- the same account is fine (unchanged pre-existing behavior; the unique
  -- index only applies once progress_source='linked_account').
  INSERT INTO savings_goals (household_id, account_id, name, target_agorot, created_by)
  VALUES (
    '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001',
    'יעד שני', 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  )
  RETURNING id INTO v_second_goal_id;

  SELECT update_savings_goal(
    v_second_goal_id, 1, 'יעד שני', 50000, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, NULL, NULL, 'linked_account'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'account_already_linked' THEN
    RAISE EXCEPTION 'FAIL 12.3: expected account_already_linked, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE id = v_second_goal_id AND progress_source = 'linked_account') THEN
    RAISE EXCEPTION 'FAIL 12.3: the second goal was linked despite the rejection';
  END IF;

  PERFORM _pass('12.3', 'update_savings_goal() rejects linking a second goal''s progress to an account already linked to another goal (account_already_linked) — preserves the safe/manual path instead of double-counting one account''s balance across goals');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_3;

-- 12.4: "avoid double counting/manual progress ambiguity" — once a goal is
-- linked_account, update_savings_goal_progress() (the manual write path)
-- is rejected server-side, not only hidden in the UI.
SAVEPOINT sp_12_4;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  PERFORM update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד חיסכון בית 1', 100000, '5a000000-0000-0000-0000-000000000001'::uuid, NULL, NULL, NULL, 'linked_account'
  );

  SELECT update_savings_goal_progress('59000000-0000-0000-0000-000000000001'::uuid, 2, 75000) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'progress_is_linked' THEN
    RAISE EXCEPTION 'FAIL 12.4: expected progress_is_linked for a manual-progress write on a linked goal, got %', v_result;
  END IF;
  IF EXISTS (SELECT 1 FROM savings_goals WHERE id = '59000000-0000-0000-0000-000000000001' AND current_agorot = 75000) THEN
    RAISE EXCEPTION 'FAIL 12.4: current_agorot was written despite the goal being linked_account';
  END IF;
  PERFORM _pass('12.4', 'update_savings_goal_progress() rejects a manual current_agorot write on a linked_account goal (progress_is_linked), closing the gap server-side, not only in the UI');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_4;

-- 12.5: an unrecognized progress_source value is rejected cleanly.
SAVEPOINT sp_12_5;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
DECLARE v_result JSONB;
BEGIN
  SELECT update_savings_goal(
    '59000000-0000-0000-0000-000000000001'::uuid, 1,
    'יעד חיסכון בית 1', 100000, NULL, NULL, NULL, NULL, 'not_a_real_source'
  ) INTO v_result;
  IF (v_result->>'ok')::boolean OR v_result->>'error' <> 'invalid_progress_source' THEN
    RAISE EXCEPTION 'FAIL 12.5: expected invalid_progress_source, got %', v_result;
  END IF;
  PERFORM _pass('12.5', 'update_savings_goal() rejects an unrecognized progress_source value (invalid_progress_source)');
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_5;

-- 12.6: defense in depth — the partial unique index itself (not only the
-- RPC's pre-check) blocks a second linked_account goal on the same account,
-- even via a direct client INSERT (still directly grantable, migration 009).
SAVEPOINT sp_12_6;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';
DO $$
BEGIN
  INSERT INTO savings_goals (household_id, account_id, name, target_agorot, created_by, progress_source)
  VALUES (
    '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001',
    'יעד א', 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'linked_account'
  );

  BEGIN
    INSERT INTO savings_goals (household_id, account_id, name, target_agorot, created_by, progress_source)
    VALUES (
      '11111111-1111-1111-1111-111111111111', '5a000000-0000-0000-0000-000000000001',
      'יעד ב', 50000, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'linked_account'
    );
    RAISE EXCEPTION 'FAIL 12.6: a second linked_account goal on the same account was allowed by a direct INSERT';
  EXCEPTION WHEN unique_violation THEN
    PERFORM _pass('12.6', 'the partial unique index on (account_id) WHERE progress_source=linked_account blocks a second linked_account goal on the same account even via a direct client INSERT, not only inside the RPC — defense in depth');
  END;
END $$;
RESET role;
ROLLBACK TO SAVEPOINT sp_12_6;

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
  RAISE NOTICE '=== % tests passed (Groups 1,2,3,4 in full; 3b,3c,5 minus 5.9,6 in full; D2/D6/VM/RPC/grants-parity Milestone 6; DB.PARITY/RECURRING/RECURRING.GRANTS/RECURRING.SKIP/RECURRING.ATOMICITY/SAVINGS.TRIGGER Milestone 7 additions, minus RECURRING.CONCURRENT; Group 7 Milestone 9 additions, minus DELETE_ACCOUNT.CONCURRENT; Group 8 leave_household additions, minus LEAVE.CONCURRENT; Group 9 internal transfers, migration 008; Group 10 optimistic concurrency protection, migration 009) ===', v_total;
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
