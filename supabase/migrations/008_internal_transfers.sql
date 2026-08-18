-- OurMoney — Migration 008: Internal account transfers
--
-- See docs/DECISIONS.md ADR-035 for the full decision record. Summary: money
-- moved between two accounts the same household owns is modeled as exactly
-- two `transactions` rows (source leg negative, destination leg positive,
-- summing to zero) linked to one new `transfers` parent row via a nullable
-- `transactions.transfer_id` FK — never as an ordinary income/expense row,
-- which would incorrectly inflate spending/income analytics and budgets for
-- money that never left the household. Account balances (computed by
-- summing every `transactions.amount_agorot` per account with no
-- special-casing) are correct automatically once transfer legs exist as
-- real signed rows — no engine changes anywhere.
--
-- Design-stage review (architecture-reviewer, database-security-reviewer,
-- product-scope-guardian) before this file was written found and required
-- fixes for: (1) the transactions_update RLS gap below (§3), (2)
-- transfers.created_by needing ON DELETE SET NULL from day one plus a
-- leave_household()/delete_own_account() widening in this same migration
-- (§5), (3) row-locking-first / row-count-verified RPCs instead of an
-- unlocked validate-then-write shape (§4), (4) delete_transfer() being
-- admin-gated to match every other hard-delete of a shared resource in this
-- schema, (5) transfers' own table grant being SELECT-only, matching its
-- policy exactly rather than relying on RLS alone to deny a wider grant.
--
-- ============================================================================
-- 1. transfers table
-- ============================================================================

CREATE TABLE transfers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  from_account_id  UUID        NOT NULL REFERENCES accounts(id),
  to_account_id    UUID        NOT NULL REFERENCES accounts(id),
  amount_agorot    BIGINT      NOT NULL CHECK (amount_agorot > 0),
  txn_date         DATE        NOT NULL,
  description      TEXT        NOT NULL,
  -- ON DELETE SET NULL from day one — NOT retrofitted later like
  -- recurring_transactions.created_by/savings_goals.created_by needed in
  -- migration 004. Without it, delete_own_account() would fail with a raw
  -- FK-violation error for any user who ever created a transfer.
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_account_id <> to_account_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_transfers_household ON transfers(household_id);

-- ============================================================================
-- 2. transactions.transfer_id — the leg link
-- ============================================================================
--
-- ON DELETE CASCADE (unlike matched_rule_id's SET NULL in migration 006):
-- a transfer leg has no meaning independent of its parent transfer — the
-- whole point of this design is that the two legs and the transfers row
-- rise and fall together. delete_transfer() below relies on exactly this:
-- a single `DELETE FROM transfers` removes both legs atomically, in the
-- same statement, with no separate DELETE needed.

ALTER TABLE transactions
  ADD COLUMN transfer_id UUID REFERENCES transfers(id) ON DELETE CASCADE;

-- Defense-in-depth beyond the query-side exclusions added to
-- filterForAnalytics.ts/useBudgetProgress.ts/usePriceIncreaseDetections.ts/
-- useUncategorizedTransactions.ts/useApplyRulesRetroactively.ts: a transfer
-- row can never carry a category at the database layer, so a bug in any one
-- of those query-side filters cannot let a transfer leg be silently
-- categorized or surfaced as "needs a category."
ALTER TABLE transactions
  ADD CONSTRAINT transactions_transfer_no_category CHECK (transfer_id IS NULL OR category_id IS NULL);

CREATE INDEX idx_transactions_transfer ON transactions(transfer_id) WHERE transfer_id IS NOT NULL;

-- ============================================================================
-- 3. RLS
-- ============================================================================
--
-- transfers: SELECT only. No INSERT/UPDATE/DELETE policy exists at all —
-- mirroring household_members' no-role-change-policy precedent (ADR-022).
-- Every mutation goes through the SECURITY DEFINER RPCs in §4, which bypass
-- RLS entirely for their own writes.

ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfers_select" ON transfers
  FOR SELECT TO authenticated USING (is_household_member(household_id));

-- transactions_insert/_update/_delete are tightened to require
-- transfer_id IS NULL, so a transfer leg can only ever be written by
-- create_transfer()/update_transfer()/delete_transfer() below, never via
-- the generic client-side paths that apply to every other transaction.
--
-- transactions_update gets the restriction in BOTH USING and WITH CHECK —
-- not WITH CHECK alone. WITH CHECK only constrains the row's state AFTER
-- a write; without the same restriction in USING, a single statement like
--   UPDATE transactions SET transfer_id = NULL, amount_agorot = 999999
--   WHERE id = '<a transfer leg>'
-- would detach a leg from its transfer and mutate it in the same
-- statement — USING would pass (still just household membership) and the
-- tightened WITH CHECK would also pass, because the row's NEW transfer_id
-- really is NULL. Found in design-stage review before this file was
-- written, not after. transactions_delete only has USING (Postgres DELETE
-- policies have no WITH CHECK), so a single addition there is sufficient.
-- transactions_insert only needs WITH CHECK, since INSERT has no prior row
-- state to protect.
--
-- DROP+CREATE against the migration 006 form (the one with
-- matched_rule_id coherence) — migrations are immutable, so the live
-- policy is the latest version, and this migration widens that one.

DROP POLICY "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND account_id IN (SELECT id FROM accounts WHERE accounts.household_id = transactions.household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = transactions.household_id OR categories.household_id IS NULL)
    )
    AND (
      recurring_id IS NULL
      OR recurring_id IN (SELECT id FROM recurring_transactions WHERE recurring_transactions.household_id = transactions.household_id)
    )
    AND (
      matched_rule_id IS NULL
      OR matched_rule_id IN (SELECT id FROM category_rules WHERE category_rules.household_id = transactions.household_id)
    )
    AND created_by = auth.uid()
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

DROP POLICY "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id) AND transfer_id IS NULL)
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND account_id IN (SELECT id FROM accounts WHERE accounts.household_id = transactions.household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = transactions.household_id OR categories.household_id IS NULL)
    )
    AND (
      recurring_id IS NULL
      OR recurring_id IN (SELECT id FROM recurring_transactions WHERE recurring_transactions.household_id = transactions.household_id)
    )
    AND (
      matched_rule_id IS NULL
      OR matched_rule_id IN (SELECT id FROM category_rules WHERE category_rules.household_id = transactions.household_id)
    )
    AND (
      created_by IS NULL
      OR created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

DROP POLICY "transactions_delete" ON transactions;
CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE TO authenticated USING (is_household_admin(household_id) AND transfer_id IS NULL);

-- ============================================================================
-- 4. Grants
-- ============================================================================
--
-- SELECT only for transfers — matching its policy exactly (no
-- INSERT/UPDATE/DELETE policy exists), not relying on RLS alone to deny
-- what a wider grant would permit (the same "grants match policies exactly,
-- in both directions" discipline migration 002's grants section documents).
-- Also revokes the table-wide TRUNCATE/REFERENCES/TRIGGER privileges
-- Supabase's local Postgres grants by default on every newly created public
-- table, same reasoning as migration 002.

REVOKE ALL ON transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON transfers TO authenticated;

-- ============================================================================
-- 5. create_transfer() / update_transfer() / delete_transfer() RPCs
-- ============================================================================
--
-- All three: SECURITY DEFINER (the only way three row-writes — transfer +
-- 2 legs — are guaranteed all-or-nothing from the client's perspective),
-- fixed search_path, EXECUTE revoked from PUBLIC/anon and granted only to
-- authenticated. Every mutating statement inlines
-- "AND household_id = v_household_id" rather than trusting an earlier
-- isolated membership check (ADR-023's "structural guards over enumerated
-- assertions"), and update_transfer/delete_transfer take their row lock as
-- the FIRST statement that touches transfers — a locking
-- UPDATE/DELETE ... WHERE id = ..., never an earlier unlocked SELECT used
-- only to validate before separate writes. This closes the exact
-- unlocked-SELECT-then-write TOCTOU shape migration 005 had to fix twice
-- for leave_household()/delete_own_account()'s admin-succession queries.
-- No pg_advisory_xact_lock is needed here: unlike that succession race
-- (a candidate SELECTed from a set, which can vanish before use), the
-- contended invariant here — "a transfer has exactly two balanced legs" —
-- is anchored to one row identified directly by primary key, and an
-- ordinary row lock on that row already serializes every concurrent call
-- against it for the duration of the transaction.
--
-- source = 'manual' for both legs is a deliberate, minimal choice, not an
-- overload: a transfer leg is not a user-entered manual transaction, but
-- widening the existing source CHECK ('manual'/'csv_import'/'recurring')
-- to add a fourth value for a distinction nothing currently reads would be
-- exactly the kind of speculative schema change CLAUDE.md's scope
-- discipline warns against. is_shared=TRUE/payer_id=NULL for both legs are
-- likewise inert placeholders — transfers are excluded from every
-- budget/analytics query by transfer_id, independent of is_shared's value.

CREATE OR REPLACE FUNCTION create_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount_agorot BIGINT,
  p_txn_date DATE,
  p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_transfer_id  UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF p_amount_agorot IS NULL OR p_amount_agorot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL OR p_from_account_id = p_to_account_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_account');
  END IF;

  IF p_txn_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_date');
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_description');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_from_account_id AND household_id = v_household_id)
     OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_to_account_id AND household_id = v_household_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
  END IF;

  INSERT INTO transfers (household_id, from_account_id, to_account_id, amount_agorot, txn_date, description, created_by)
  VALUES (v_household_id, p_from_account_id, p_to_account_id, p_amount_agorot, p_txn_date, btrim(p_description), v_user_id)
  RETURNING id INTO v_transfer_id;

  INSERT INTO transactions (
    household_id, account_id, category_id, transfer_id, amount_agorot,
    description, txn_date, is_shared, payer_id, source, created_by
  ) VALUES (
    v_household_id, p_from_account_id, NULL, v_transfer_id, -p_amount_agorot,
    btrim(p_description), p_txn_date, TRUE, NULL, 'manual', v_user_id
  );

  INSERT INTO transactions (
    household_id, account_id, category_id, transfer_id, amount_agorot,
    description, txn_date, is_shared, payer_id, source, created_by
  ) VALUES (
    v_household_id, p_to_account_id, NULL, v_transfer_id, p_amount_agorot,
    btrim(p_description), p_txn_date, TRUE, NULL, 'manual', v_user_id
  );

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_transfer_id);
END;
$$;

REVOKE ALL ON FUNCTION create_transfer(UUID, UUID, BIGINT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_transfer(UUID, UUID, BIGINT, DATE, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION update_transfer(
  p_transfer_id UUID,
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount_agorot BIGINT,
  p_txn_date DATE,
  p_description TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_rows         INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF p_amount_agorot IS NULL OR p_amount_agorot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL OR p_from_account_id = p_to_account_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_account');
  END IF;

  IF p_txn_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_date');
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_description');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_from_account_id AND household_id = v_household_id)
     OR NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_to_account_id AND household_id = v_household_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
  END IF;

  -- First touch of transfers is a locking UPDATE that also validates
  -- household ownership in the same statement — not an earlier unlocked
  -- SELECT. A concurrent update_transfer/delete_transfer call on the same
  -- p_transfer_id blocks on this row lock until this transaction commits
  -- or rolls back.
  UPDATE transfers
  SET from_account_id = p_from_account_id,
      to_account_id   = p_to_account_id,
      amount_agorot   = p_amount_agorot,
      txn_date        = p_txn_date,
      description     = btrim(p_description)
  WHERE id = p_transfer_id AND household_id = v_household_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- The source/destination legs are distinguished by sign, not by a
  -- separate stored role column — the source leg is whichever one is
  -- currently negative. Safe because both legs are only ever touched
  -- through these RPCs (RLS forces this — see §3), and the transfers row
  -- lock above already serializes every other concurrent mutation of
  -- these same two rows.
  UPDATE transactions
  SET account_id  = p_from_account_id,
      amount_agorot = -p_amount_agorot,
      txn_date    = p_txn_date,
      description = btrim(p_description)
  WHERE transfer_id = p_transfer_id AND household_id = v_household_id AND amount_agorot < 0;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'transfer % lost its source leg', p_transfer_id;
  END IF;

  UPDATE transactions
  SET account_id  = p_to_account_id,
      amount_agorot = p_amount_agorot,
      txn_date    = p_txn_date,
      description = btrim(p_description)
  WHERE transfer_id = p_transfer_id AND household_id = v_household_id AND amount_agorot > 0;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'transfer % lost its destination leg', p_transfer_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_transfer(UUID, UUID, UUID, BIGINT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_transfer(UUID, UUID, UUID, BIGINT, DATE, TEXT) TO authenticated;

-- Admin-gated, matching transactions_delete's existing admin-only
-- hard-delete convention (docs/ARCHITECTURE.md's Security Model Summary:
-- "DELETE on shared resources is admin-only") — deleting a transfer
-- permanently removes two real transaction rows, the same destructive-
-- action class as any other hard delete in this schema.
CREATE OR REPLACE FUNCTION delete_transfer(p_transfer_id UUID) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_role         TEXT;
  v_rows         INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id, role INTO v_household_id, v_role FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  -- Single statement, household-scoped, and ON DELETE CASCADE (§2) removes
  -- both linked transaction legs atomically in this same statement — no
  -- separate DELETE FROM transactions needed.
  DELETE FROM transfers WHERE id = p_transfer_id AND household_id = v_household_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_transfer(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_transfer(UUID) TO authenticated;

-- ============================================================================
-- 6. leave_household() / delete_own_account() — null transfers.created_by
-- ============================================================================
--
-- Re-created (not edited — migrations are an immutable historical record in
-- this project's convention, exactly as migration 005 re-created migration
-- 004's delete_own_account() rather than altering that file), each with one
-- added statement nulling transfers.created_by for a departing member in a
-- continuing household. Required even though transfers.created_by already
-- has ON DELETE SET NULL (§1) — that FK behavior only fires when the
-- auth.users row itself is deleted (delete_own_account()'s case), not when
-- a user merely leaves a household while keeping their account
-- (leave_household()'s case) or when they remain a member but their row is
-- about to no longer be reachable via household_members for RLS's WITH
-- CHECK. No RLS policy on transfers reads created_by (§3), so unlike
-- transactions/recurring_transactions/savings_goals this is pure
-- attribution hygiene, not a WITH CHECK correctness requirement — but the
-- same "no orphaned FK pointing at a user no longer in the household"
-- discipline migration 005 established for every other attribution column
-- applies here too. No change in the sole-member-leaves branch of either
-- function: household_id ON DELETE CASCADE (§1) removes the household's
-- transfers rows (and their legs) in that branch already.

CREATE OR REPLACE FUNCTION leave_household()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID := auth.uid();
  v_household_id       UUID;
  v_role               TEXT;
  v_other_member_count INT;
  v_new_admin_id       UUID;
  v_household_deleted  BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  PERFORM pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

  SELECT role INTO v_role
  FROM household_members
  WHERE household_id = v_household_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'household_deleted', false, 'new_admin_id', NULL);
  END IF;

  SELECT COUNT(*) INTO v_other_member_count
  FROM household_members
  WHERE household_id = v_household_id AND user_id <> v_user_id;

  IF v_other_member_count = 0 THEN
    DELETE FROM households WHERE id = v_household_id;
    v_household_deleted := TRUE;
  ELSE
    IF v_role = 'admin' THEN
      SELECT user_id INTO v_new_admin_id
      FROM household_members
      WHERE household_id = v_household_id AND user_id <> v_user_id
      ORDER BY joined_at ASC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE household_members
        SET role = 'admin'
        WHERE household_id = v_household_id AND user_id = v_new_admin_id;
      ELSE
        v_new_admin_id := NULL;
      END IF;
    END IF;

    UPDATE households
      SET created_by = NULL
      WHERE id = v_household_id AND created_by = v_user_id;
    UPDATE invitations
      SET invited_by = NULL
      WHERE household_id = v_household_id AND invited_by = v_user_id;
    UPDATE accounts
      SET owner_id = NULL
      WHERE household_id = v_household_id AND owner_id = v_user_id;
    UPDATE transactions
      SET payer_id = NULL
      WHERE household_id = v_household_id AND payer_id = v_user_id;
    UPDATE transactions
      SET created_by = NULL
      WHERE household_id = v_household_id AND created_by = v_user_id;
    UPDATE recurring_transactions
      SET created_by = NULL
      WHERE household_id = v_household_id AND created_by = v_user_id;
    UPDATE savings_goals
      SET created_by = NULL
      WHERE household_id = v_household_id AND created_by = v_user_id;
    UPDATE planned_obligations
      SET created_by = NULL
      WHERE household_id = v_household_id AND created_by = v_user_id;
    UPDATE transfers
      SET created_by = NULL
      WHERE household_id = v_household_id AND created_by = v_user_id;

    DELETE FROM household_members
    WHERE household_id = v_household_id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'household_deleted', v_household_deleted,
    'new_admin_id', v_new_admin_id
  );
END;
$$;

REVOKE ALL ON FUNCTION leave_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION leave_household() TO authenticated;

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id           UUID := auth.uid();
  v_household_id      UUID;
  v_role              TEXT;
  v_other_member_count INT;
  v_new_admin_id      UUID;
  v_household_deleted BOOLEAN := FALSE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id;

  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

    SELECT role INTO v_role
    FROM household_members
    WHERE household_id = v_household_id AND user_id = v_user_id;

    SELECT COUNT(*) INTO v_other_member_count
    FROM household_members
    WHERE household_id = v_household_id AND user_id <> v_user_id;

    IF v_other_member_count = 0 THEN
      DELETE FROM households WHERE id = v_household_id;
      v_household_deleted := TRUE;
    ELSE
      IF v_role = 'admin' THEN
        SELECT user_id INTO v_new_admin_id
        FROM household_members
        WHERE household_id = v_household_id AND user_id <> v_user_id
        ORDER BY joined_at ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
          UPDATE household_members
          SET role = 'admin'
          WHERE household_id = v_household_id AND user_id = v_new_admin_id;
        ELSE
          v_new_admin_id := NULL;
        END IF;
      END IF;

      UPDATE households
        SET created_by = NULL
        WHERE id = v_household_id AND created_by = v_user_id;
      UPDATE invitations
        SET invited_by = NULL
        WHERE household_id = v_household_id AND invited_by = v_user_id;
      UPDATE accounts
        SET owner_id = NULL
        WHERE household_id = v_household_id AND owner_id = v_user_id;
      UPDATE transactions
        SET payer_id = NULL
        WHERE household_id = v_household_id AND payer_id = v_user_id;
      UPDATE transactions
        SET created_by = NULL
        WHERE household_id = v_household_id AND created_by = v_user_id;
      UPDATE recurring_transactions
        SET created_by = NULL
        WHERE household_id = v_household_id AND created_by = v_user_id;
      UPDATE savings_goals
        SET created_by = NULL
        WHERE household_id = v_household_id AND created_by = v_user_id;
      UPDATE planned_obligations
        SET created_by = NULL
        WHERE household_id = v_household_id AND created_by = v_user_id;
      UPDATE transfers
        SET created_by = NULL
        WHERE household_id = v_household_id AND created_by = v_user_id;
    END IF;
  END IF;

  DELETE FROM auth.users WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'household_deleted', v_household_deleted,
    'new_admin_id', v_new_admin_id
  );
END;
$$;

REVOKE ALL ON FUNCTION delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
