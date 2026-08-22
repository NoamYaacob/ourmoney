-- OurMoney — Migration 016: credit-card settlement + instalment purchases
--
-- See ADR-037 (docs/DECISIONS.md) for the full decision record, including
-- the retroactive documentation of the obligation_id hard-attach pattern
-- (migration 012) this migration's installment_plan_id treatment reuses.
--
-- Highest-risk item of the Israeli-household product-evolution audit
-- (Phases B/C — credit cards, instalments). Two-round design-stage review
-- (architecture-reviewer, database-security-reviewer, both APPROVED WITH
-- CHANGES) produced this final shape, which is materially smaller than
-- docs/DATABASE_SCHEMA.md's original "Future model — installments" sketch
-- (lines 387-436) in two ways both reviewers converged on independently:
--
--   1. NO card_statements table, NO transactions.statement_id column.
--      A credit-card statement's period/next-charge-date is fully derived,
--      never stored, from a new accounts.billing_cycle_day — the same
--      "compute live, never persist" discipline this codebase already
--      applies to account balances (computeAccountBalances.ts) and, this
--      same milestone, savings-goal linked progress (migration 015). A
--      stored, client-writable period_start/period_end with no overlap
--      constraint would have been a fabricable-financial-figure surface
--      (database-security-reviewer finding) with zero engine benefit —
--      "current cycle spend" is just `WHERE txn_date BETWEEN period_start
--      AND period_end`, computed at query time in the app layer.
--
--   2. Settlement (the bank auto-debiting checking for a card statement) is
--      NOT a new concept. It is an ordinary internal transfer
--      (create_transfer(), migration 008) — checking account debited,
--      credit-card account credited. Every expense/budget/Safe-to-Spend
--      query already excludes transfer_id IS NOT NULL rows
--      (features/budgets/hooks/useBudgetProgress.ts and every cash-flow
--      engine call site), so this needs zero engine changes and cannot
--      double-count a purchase already recognized when it was made — the
--      governing invariant of this whole milestone: "A purchase is an
--      expense once. Moving money between internal accounts, paying a
--      credit-card statement, or settling an already-recognized obligation
--      must never create a second expense."
--
-- What IS new: instalment purchases as a first-class plan
-- (installment_plans) whose individual monthly charges are materialized as
-- ordinary transactions ONLY once their charge date has arrived —
-- generate_installment_transactions() below is a structural mirror of
-- generate_recurring_transactions() (migration 003)'s row-locked,
-- catch-up-safe loop, extended with the attach-hard-block treatment
-- migration 012 established for transactions.obligation_id (transactions_
-- insert/_update require installment_plan_id IS NULL; only this SECURITY
-- DEFINER function may ever set it). A not-yet-materialized instalment is
-- purely a forecast number (lib/engines/cashflow/forecastInstallmentOccurrences.ts,
-- a later app-layer task) — never a transaction, never summed into "this
-- month's spending" — so a 12-instalment ₪12,000 purchase is never entered
-- as one lump transaction, exactly matching docs/DATABASE_SCHEMA.md's
-- existing "what MVP must avoid" guidance for this same future model.
--
-- Security-review-required fixes baked in from the start (not retrofitted):
--   - installment_plans.created_by is nullable + ON DELETE SET NULL, unlike
--     the migration-002 originals of recurring_transactions.created_by/
--     savings_goals.created_by that migration 004 had to relax after the
--     fact. leave_household()/delete_own_account() (migration 008's live
--     versions) are re-created with one added statement each, exactly
--     mirroring how migration 008 itself added the equivalent line for
--     transfers.created_by.
--   - Financial fields (account_id, total_agorot, installment_count,
--     monthly_agorot, first_charge_date) are permanently immutable once a
--     plan is created — update_installment_plan() can only ever change
--     description/merchant_name/category_id/is_shared. This is a strictly
--     safer, simpler cut than a conditional "blocked only once instalments
--     have materialized" guard (which the review flagged as required at
--     minimum): an unconditional block trivially satisfies "never let a
--     financial figure drift after real transactions were generated
--     against it," and if a plan was mis-entered, delete + recreate is the
--     correct fix (mirroring how a real תשלומים plan would need
--     cancellation + redo, not silent renumbering, in real life anyway).
--   - generate_installment_transactions() is SECURITY DEFINER (not
--     SECURITY INVOKER like generate_recurring_transactions()) — the hard
--     attach-block on installment_plan_id means only a DEFINER-bypassed
--     write can ever set it, the same reason complete_planned_obligation()
--     (migration 012) is DEFINER while generate_recurring_transactions()
--     (migration 003, whose recurring_id link is a softer coherence check,
--     not a hard block) is INVOKER.
--   - The last instalment absorbs the floor-division remainder
--     (monthly_agorot = total_agorot / installment_count via integer
--     division, enforced by a CHECK so the client cannot supply a
--     mismatched value; the final instalment's amount is computed as
--     total_agorot - monthly_agorot * (installment_count - 1) inside the
--     generator, never trusted from a stored "last amount" field) —
--     guarantees sum(all materialized instalments) == total_agorot exactly
--     for every (total_agorot, installment_count) pair, with no float
--     division anywhere.
--   - source stays 'manual' for generated instalment transactions — NOT
--     widening the existing source CHECK ('manual'/'csv_import'/
--     'recurring'), following the exact precedent migration 008 (transfer
--     legs) and migration 012 (obligation-linked transactions) already
--     set: installment_plan_id IS NOT NULL is itself the complete,
--     sufficient signal: widening a CHECK for a value nothing currently
--     reads is speculative.
--
-- ============================================================================
-- 1. accounts.billing_cycle_day
-- ============================================================================
--
-- Nullable, credit-card-only in practice (not schema-enforced across
-- tables — Postgres cannot express a cross-table CHECK; the account-edit
-- RPC/UI restricts this field to credit_card-type accounts at the app
-- layer, the same limitation this migration's own account_id-type
-- coherence check below already lives with for installment_plans).
-- 1..28 avoids every month-length edge case (no 29/30/31 to fall back
-- from) — Israeli card billing cycles are always a fixed day-of-month.
ALTER TABLE accounts
  ADD COLUMN billing_cycle_day INTEGER CHECK (billing_cycle_day BETWEEN 1 AND 28);

-- ============================================================================
-- 2. installment_plans — the economic event, never itself a transaction
-- ============================================================================

CREATE TABLE installment_plans (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id         UUID        NOT NULL REFERENCES accounts(id),
  category_id        UUID        REFERENCES categories(id),
  merchant_name      TEXT,
  description        TEXT        NOT NULL,
  total_agorot       BIGINT      NOT NULL CHECK (total_agorot > 0),
  installment_count  INTEGER     NOT NULL CHECK (installment_count > 0),
  -- Floor division, enforced (not trusted from the client as an arbitrary
  -- value) — the CHECK itself is the parity proof between this stored
  -- field and what generate_installment_transactions() below independently
  -- recomputes for every instalment but the last.
  monthly_agorot     BIGINT      NOT NULL CHECK (monthly_agorot > 0 AND monthly_agorot = total_agorot / installment_count),
  first_charge_date  DATE        NOT NULL,
  is_shared          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version            BIGINT      NOT NULL DEFAULT 1
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON installment_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_installment_plans_household ON installment_plans(household_id);

ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT open to household members (same shape as planned_obligations
-- pre-migration-009, savings_goals) with D2-style coherence checks, plus one
-- installment-specific leg: account_id must be a credit_card-type account in
-- this household — the only place in this migration that check can live,
-- since Postgres has no cross-table CHECK.
CREATE POLICY "installment_plans_select" ON installment_plans
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "installment_plans_insert" ON installment_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND account_id IN (
      SELECT id FROM accounts
      WHERE accounts.household_id = installment_plans.household_id AND accounts.type = 'credit_card'
    )
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = installment_plans.household_id OR categories.household_id IS NULL)
    )
    AND created_by = auth.uid()
  );

-- UPDATE/DELETE closed entirely — matching migration 009's final shape for
-- planned_obligations/savings_goals, not migration 007's original (now
-- superseded) open-UPDATE-with-RLS-CAS-trigger shape. All mutation goes
-- through update_installment_plan()/delete_installment_plan() below.
REVOKE ALL ON installment_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON installment_plans TO authenticated;

-- ============================================================================
-- 3. transactions.installment_plan_id / installment_index
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN installment_plan_id UUID REFERENCES installment_plans(id) ON DELETE SET NULL,
  ADD COLUMN installment_index   INTEGER;

-- Defense-in-depth structural guard (cheap, independent of the RLS/RPC
-- surface below): the index is always a positive 1-based ordinal.
--
-- Deliberately NOT a symmetry CHECK requiring (installment_plan_id IS NULL)
-- = (installment_index IS NULL) — CI's real Postgres run caught exactly why
-- that would be wrong: installment_plan_id's own ON DELETE SET NULL (above)
-- fires when a plan is deleted and nulls only the FK column, never
-- installment_index alongside it, so a materialized instalment surviving
-- its plan's deletion (§5, delete_installment_plan()) always ends up with
-- installment_plan_id NULL and installment_index still set — and that is
-- the correct, desired end state, not a bug to prevent: the row keeps
-- remembering "this was instalment #1" the same way matched_rule_id's own
-- ON DELETE SET NULL (migration 006) leaves a transaction's history
-- otherwise intact once its rule is deleted. A symmetry CHECK here would
-- fight the very ON DELETE SET NULL behavior this migration's header
-- deliberately chose over ON DELETE CASCADE.
ALTER TABLE transactions ADD CONSTRAINT transactions_installment_index_positive
  CHECK (installment_index IS NULL OR installment_index >= 1);

CREATE INDEX idx_transactions_installment_plan
  ON transactions(installment_plan_id) WHERE installment_plan_id IS NOT NULL;

-- Hard attach-block, exactly mirroring obligation_id's treatment (migration
-- 012 §2), NOT a softer household-coherence check: only
-- generate_installment_transactions() below (SECURITY DEFINER, bypasses
-- this RLS for its own INSERT) may ever set installment_plan_id/
-- installment_index. A direct client INSERT/UPDATE attaching either to an
-- ordinary transaction must fail — without this, a household member could
-- fabricate instalment history with no relation to any plan's amount/count,
-- or detach-and-mutate a materialized instalment's amount in the same
-- UPDATE statement (the USING clause closes that half, matching ADR-035's
-- reasoning for transfer_id's own USING clause).
DROP POLICY "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND obligation_id IS NULL
    AND installment_plan_id IS NULL
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
  USING (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND obligation_id IS NULL
    AND installment_plan_id IS NULL
  )
  WITH CHECK (
    is_household_member(household_id)
    AND transfer_id IS NULL
    AND obligation_id IS NULL
    AND installment_plan_id IS NULL
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
-- 4. update_installment_plan() — identity-only edit (financial fields are
--    permanently immutable, see header)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_installment_plan(
  p_id UUID,
  p_expected_version BIGINT,
  p_description TEXT,
  p_merchant_name TEXT,
  p_category_id UUID,
  p_is_shared BOOLEAN
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

  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_description');
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = p_category_id AND (household_id = v_household_id OR household_id IS NULL)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_category');
  END IF;

  UPDATE installment_plans
  SET description = btrim(p_description),
      merchant_name = p_merchant_name,
      category_id = p_category_id,
      is_shared = p_is_shared,
      version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version INTO v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM installment_plans WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION update_installment_plan(UUID, BIGINT, TEXT, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_installment_plan(UUID, BIGINT, TEXT, TEXT, UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- 5. delete_installment_plan() — materialized instalments survive
--    (ON DELETE SET NULL, §3), only the plan row and future forecast go away
-- ============================================================================

CREATE OR REPLACE FUNCTION delete_installment_plan(
  p_id UUID,
  p_expected_version BIGINT
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

  DELETE FROM installment_plans
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM installment_plans WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_installment_plan(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_installment_plan(UUID, BIGINT) TO authenticated;

-- ============================================================================
-- 6. generate_installment_transactions() — whole-household, catch-up-safe
--    materialization, structural mirror of generate_recurring_transactions()
--    (migration 003) with SECURITY DEFINER instead of INVOKER (see header)
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_installment_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_household_id   UUID;
  v_plan           RECORD;
  v_next_index     INT;
  v_charge_date    DATE;
  v_amount_agorot  BIGINT;
  v_transaction_id UUID;
  v_results        JSONB := '[]'::jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_household');
  END IF;

  -- Lock every plan in this household up front, in a stable order (id) —
  -- identical concurrency discipline to migration 003's template loop.
  -- Without this lock, two concurrent calls (e.g. both household members'
  -- apps syncing at once) could each read the same "3 of 12 materialized"
  -- snapshot and both insert installment_index = 4, double-counting one
  -- real expense — precisely the invariant this whole migration exists to
  -- protect.
  FOR v_plan IN
    SELECT * FROM installment_plans WHERE household_id = v_household_id ORDER BY id FOR UPDATE
  LOOP
    -- Next index to materialize is derived live from the real transaction
    -- rows already generated for this plan — never a separately-stored
    -- counter that could drift from reality.
    SELECT COALESCE(MAX(installment_index), 0) + 1 INTO v_next_index
    FROM transactions
    WHERE installment_plan_id = v_plan.id;

    WHILE v_next_index <= v_plan.installment_count LOOP
      v_charge_date := (v_plan.first_charge_date + ((v_next_index - 1) * INTERVAL '1 month'))::date;
      EXIT WHEN v_charge_date > CURRENT_DATE;

      -- Every instalment but the last uses the plan's stored, CHECK-proven
      -- monthly_agorot; the last absorbs whatever floor-division remainder
      -- is left, computed here (never trusted from a stored field), so
      -- sum(all instalments) always equals total_agorot exactly.
      v_amount_agorot := CASE
        WHEN v_next_index = v_plan.installment_count
          THEN v_plan.total_agorot - v_plan.monthly_agorot * (v_plan.installment_count - 1)
        ELSE v_plan.monthly_agorot
      END;

      -- source stays 'manual' — see header for why this migration does not
      -- widen the source CHECK, matching migration 008/012's precedent.
      INSERT INTO transactions (
        household_id, account_id, category_id, installment_plan_id, installment_index,
        amount_agorot, description, txn_date, is_shared, source, created_by
      ) VALUES (
        v_household_id, v_plan.account_id, v_plan.category_id, v_plan.id, v_next_index,
        -v_amount_agorot, v_plan.description, v_charge_date, v_plan.is_shared, 'manual', v_user_id
      ) RETURNING id INTO v_transaction_id;

      v_results := v_results || jsonb_build_object(
        'installmentPlanId', v_plan.id,
        'transactionId', v_transaction_id,
        'installmentIndex', v_next_index,
        'txnDate', v_charge_date
      );

      v_next_index := v_next_index + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION generate_installment_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_installment_transactions() TO authenticated;

-- ============================================================================
-- 7. leave_household() / delete_own_account() — null installment_plans.
--    created_by for a departing member of a continuing household
-- ============================================================================
--
-- Re-created (not edited — migrations are an immutable historical record in
-- this project's convention), each with one added statement, exactly
-- mirroring migration 008 §6's identical addition for transfers.created_by.
-- Required even though installment_plans.created_by already has ON DELETE
-- SET NULL (§2) — that FK behavior only fires when the auth.users row
-- itself is deleted (delete_own_account()'s case), not when a user merely
-- leaves a household while keeping their account (leave_household()'s
-- case). No change in the sole-member-leaves branch of either function:
-- household_id ON DELETE CASCADE (§2) removes the household's
-- installment_plans rows already in that branch.

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
    UPDATE installment_plans
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
      UPDATE installment_plans
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
