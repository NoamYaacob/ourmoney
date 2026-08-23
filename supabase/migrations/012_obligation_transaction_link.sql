-- OurMoney — Migration 012: link a planned obligation to the real transaction
-- created when it is marked paid
--
-- Migration 007's own header comment explicitly deferred this: "'mark paid'
-- in this milestone is a status transition only ... Generating a real
-- transaction from an obligation, with confirmation, is documented as the
-- deliberate next step ... A future additive migration can add it alongside
-- the code that actually uses it." This is that migration.
--
-- Design-stage review (architecture-reviewer, database-security-reviewer,
-- two rounds) before this file was written found and required fixed:
--   1. `transactions.obligation_id` must be impossible for a normal client
--      to set directly — the generic transactions_insert/_update policies
--      are widened to require `obligation_id IS NULL`, exactly mirroring
--      `transfer_id`'s existing hard-block treatment (migration 008), not a
--      softer D2-style coherence check. Only complete_planned_obligation()
--      below (SECURITY DEFINER, bypasses RLS for its own writes) can ever
--      set it. Without this, a client could link a transaction to an
--      obligation without ever transitioning its status — silently
--      reintroducing the exact double-count Safe-to-Spend/cash-flow forecast
--      would otherwise produce (a real transaction on the books, but the
--      obligation still counted as upcoming).
--   2. set_planned_obligation_status() (migration 009) is widened to reject
--      any status change on an obligation that already has a linked
--      transaction — otherwise `set_planned_obligation_status(id, version,
--      'upcoming')` is a fully version-valid call that would silently
--      revert an already-completed, transaction-linked obligation, causing
--      the same double-count. The guard is scoped by household_id (second
--      review round finding): an unscoped `EXISTS` check would let any
--      authenticated user distinguish "this foreign-household obligation id
--      doesn't exist" from "it exists, is completed, and has a linked
--      transaction" — an existence/state oracle across households.
--   3. transactions.obligation_id uses ON DELETE SET NULL, matching
--      matched_rule_id's precedent (migration 006) — not transfer_id's
--      ON DELETE CASCADE (migration 008), because a transaction created from
--      an obligation is a real, standalone financial record with meaning
--      independent of the obligation, unlike a transfer leg. Without this,
--      delete_planned_obligation() on a completed+linked obligation would
--      raise a raw, unhandled Postgres FK-violation instead of this
--      codebase's {ok:false, error:...} JSON contract.
--   4. source stays 'manual' — NOT widening the source CHECK constraint.
--      Same reasoning migration 008 already gave for transfer legs:
--      widening a CHECK constraint to add a value nothing currently reads
--      would be speculative. obligation_id IS NOT NULL is itself the
--      complete, sufficient signal.
--
-- ============================================================================
-- 1. transactions.obligation_id
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN obligation_id UUID REFERENCES planned_obligations(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_obligation
  ON transactions(obligation_id) WHERE obligation_id IS NOT NULL;

-- ============================================================================
-- 2. RLS — obligation_id can only ever be set by complete_planned_obligation()
-- ============================================================================
--
-- Same "DROP+CREATE the live version" convention migration 008 used to widen
-- migration 006's policies — migrations are immutable, so the live policy is
-- the latest version (migration 008's), not migration 002's original.

DROP POLICY "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND obligation_id IS NULL
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
  USING (is_household_member(household_id) AND transfer_id IS NULL AND obligation_id IS NULL)
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND obligation_id IS NULL
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

-- ============================================================================
-- 3. complete_planned_obligation() — the atomic "mark paid + optionally
--    create the linked transaction" RPC
-- ============================================================================
--
-- p_create_transaction = FALSE is a legitimate, supported call shape (mark
-- paid, no transaction) — but the client-side convention is to route that
-- case through the existing set_planned_obligation_status() instead (see
-- the obligations hooks), since that function already does exactly that and
-- this migration adds nothing that changes its correctness for that case.
-- This RPC's own p_create_transaction branch exists so a single call can
-- still do both atomically if a future caller needs to.
--
-- Validation happens BEFORE the locking UPDATE below, not after: once the
-- UPDATE runs, the obligation is committed to 'completed' within this
-- function invocation, and a subsequent early RETURN would leave it
-- completed with no transaction ever inserted, even though the caller asked
-- for one. Order matters here, unlike create_transfer() where every
-- validation already precedes its only mutating statements.
CREATE OR REPLACE FUNCTION complete_planned_obligation(
  p_id UUID,
  p_expected_version BIGINT,
  p_create_transaction BOOLEAN,
  p_account_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_household_id   UUID;
  v_rows           INT;
  v_amount_agorot  BIGINT;
  v_category_id    UUID;
  v_is_shared      BOOLEAN;
  v_name           TEXT;
  v_new_version    BIGINT;
  v_transaction_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF p_create_transaction THEN
    IF p_account_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missing_account');
    END IF;
    -- Defense in depth: this function is SECURITY DEFINER and bypasses RLS
    -- for its own writes, so a malicious client could otherwise pass an
    -- account id belonging to a different household.
    IF NOT EXISTS (SELECT 1 FROM accounts WHERE id = p_account_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
    END IF;
  END IF;

  -- The locking write: CAS on version, and status must currently be
  -- 'upcoming' (an already-completed/cancelled row can't be marked paid
  -- again — this doubles as the "you can't do this twice" guard). RETURNING
  -- captures the fields the transaction insert below needs, off the same
  -- locked row, in the same statement — no separate SELECT ... FOR UPDATE
  -- needed first.
  UPDATE planned_obligations
  SET status = 'completed', version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version AND status = 'upcoming'
  RETURNING amount_agorot, category_id, is_shared, name, version
    INTO v_amount_agorot, v_category_id, v_is_shared, v_name, v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_create_transaction THEN
    INSERT INTO transactions (
      household_id, account_id, category_id, obligation_id,
      amount_agorot, description, txn_date, is_shared, source, created_by
    ) VALUES (
      v_household_id, p_account_id, v_category_id, p_id,
      -v_amount_agorot, v_name, CURRENT_DATE, v_is_shared, 'manual', v_user_id
    )
    RETURNING id INTO v_transaction_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'transaction_id', v_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION complete_planned_obligation(UUID, BIGINT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_planned_obligation(UUID, BIGINT, BOOLEAN, UUID) TO authenticated;

-- ============================================================================
-- 4. set_planned_obligation_status() — widened to refuse to change the
--    status of an obligation that already has a linked transaction
-- ============================================================================

CREATE OR REPLACE FUNCTION set_planned_obligation_status(
  p_id UUID,
  p_expected_version BIGINT,
  p_status TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_rows         INT;
  v_new_version  BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF p_status NOT IN ('upcoming', 'completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  -- obligation_id can now only ever be set by complete_planned_obligation()
  -- (see §2's RLS fix above), so this is a reliable signal that a real,
  -- balance-affecting transaction already exists for this obligation.
  -- Scoped by household_id: an unscoped check would let any authenticated
  -- user learn whether a foreign household's obligation id exists and is
  -- completed-with-a-linked-transaction, by comparing this error against
  -- 'not_found' below.
  IF EXISTS (SELECT 1 FROM transactions WHERE obligation_id = p_id AND household_id = v_household_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_linked_transaction');
  END IF;

  UPDATE planned_obligations
  SET status = p_status, version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version INTO v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION set_planned_obligation_status(UUID, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_planned_obligation_status(UUID, BIGINT, TEXT) TO authenticated;
