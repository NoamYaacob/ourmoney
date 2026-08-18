-- OurMoney — Migration 009: Optimistic concurrency protection for shared edits
--
-- See docs/DECISIONS.md ADR-036 for the full decision record. Summary: two
-- household members editing the same planned_obligations/recurring_transactions/
-- savings_goals row concurrently must never silently overwrite each other — the
-- second save (or delete) must fail with a distinguishable conflict when it was
-- based on a version of the row that is no longer current.
--
-- Design-stage review (architecture-reviewer, database-security-reviewer)
-- before this file was written found and required fixed:
--   1. The recurring_transactions trigger's version check must be
--      UNCONDITIONAL (NEW.version IN (OLD.version, OLD.version+1) on every
--      update), not only when a protected column changes — a purely
--      conditional check leaves `UPDATE ... SET version = <anything>` with no
--      other column touched completely unconstrained, letting version be
--      rolled backward and a stale expected_version spuriously succeed later.
--   2. planned_obligations/savings_goals grant narrowing must REVOKE ALL
--      first, not merely issue an additive GRANT SELECT, INSERT (Postgres
--      GRANT is additive, not a replace — the old broader grant would
--      otherwise silently survive).
--   3. delete_recurring_transaction() takes p_expected_version too, for the
--      same reason every other delete RPC here does (§7 below).
--   4. update_recurring_transaction()/set_recurring_transaction_active() are
--      SECURITY INVOKER and enforce_recurring_transaction_version() is a
--      trigger function — none of the three are SECURITY DEFINER, so Group
--      6.5/6.6's structural guards (which scan only SECURITY DEFINER
--      functions) do not cover their search_path/grant hygiene automatically;
--      dedicated tests are added in rls_tests.sql Group 10 for exactly these
--      three objects.
--
-- ============================================================================
-- 1. version columns
-- ============================================================================

ALTER TABLE planned_obligations ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE recurring_transactions ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
ALTER TABLE savings_goals ADD COLUMN version BIGINT NOT NULL DEFAULT 1;

-- ============================================================================
-- 2. planned_obligations — RLS-closed, SECURITY DEFINER RPCs (no competing
--    system writer for this table, so the same shape ADR-035 established for
--    transfers applies directly).
-- ============================================================================

-- The dropped policies' WITH CHECK also included a leftover-member freeze
-- guard (created_by IS NULL OR created_by IN (SELECT user_id FROM
-- household_members ...)). Deliberately not reproduced in
-- update_planned_obligation() below: it was never a caller-identity
-- authorization gate (any current member could satisfy it regardless of who
-- created the row) and leave_household()/delete_own_account() already null
-- created_by on departure, so it was never live-reachable as a real check —
-- just dead weight carried over from the row's own coherence, not something
-- this migration narrows.
DROP POLICY "planned_obligations_update" ON planned_obligations;
DROP POLICY "planned_obligations_delete" ON planned_obligations;

-- REVOKE ALL first, not an additive GRANT alone — GRANT does not replace a
-- prior, broader grant (database-security-reviewer finding #2 above).
REVOKE ALL ON planned_obligations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON planned_obligations TO authenticated;

-- update_planned_obligation(): re-validates the same D2 category/account
-- household-coherence the dropped WITH CHECK enforced, then atomically
-- compare-and-swaps. SECURITY DEFINER because RLS UPDATE no longer exists for
-- this table at all — this function's own write is the only path.
CREATE OR REPLACE FUNCTION update_planned_obligation(
  p_id UUID,
  p_expected_version BIGINT,
  p_name TEXT,
  p_amount_agorot BIGINT,
  p_due_date DATE,
  p_category_id UUID,
  p_account_id UUID,
  p_is_shared BOOLEAN,
  p_notes TEXT
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

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_name');
  END IF;
  IF p_amount_agorot IS NULL OR p_amount_agorot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_due_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_due_date');
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = p_category_id AND (household_id = v_household_id OR household_id IS NULL)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_category');
  END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts WHERE id = p_account_id AND household_id = v_household_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
  END IF;

  UPDATE planned_obligations
  SET name = btrim(p_name),
      amount_agorot = p_amount_agorot,
      due_date = p_due_date,
      category_id = p_category_id,
      account_id = p_account_id,
      is_shared = p_is_shared,
      notes = p_notes,
      version = version + 1
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

REVOKE ALL ON FUNCTION update_planned_obligation(UUID, BIGINT, TEXT, BIGINT, DATE, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_planned_obligation(UUID, BIGINT, TEXT, BIGINT, DATE, UUID, UUID, BOOLEAN, TEXT) TO authenticated;

-- set_planned_obligation_status(): the one-tap mark-paid/cancel actions —
-- narrow, single-field, same compare-and-swap shape.
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

-- delete_planned_obligation(): a stale delete is worse than a stale
-- overwrite (irreversible), so it is version-gated exactly like update.
-- Member-level, not admin-gated — matches the dropped policy's own
-- is_household_member baseline (planned_obligations_delete was never
-- admin-only), preserved exactly, not tightened or loosened.
CREATE OR REPLACE FUNCTION delete_planned_obligation(
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

  DELETE FROM planned_obligations
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM planned_obligations WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_planned_obligation(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_planned_obligation(UUID, BIGINT) TO authenticated;

-- ============================================================================
-- 3. savings_goals — same RLS-closed, SECURITY DEFINER shape as
--    planned_obligations. Two update RPCs, matching the two already-existing
--    hooks (useUpdateSavingsGoal/useUpdateSavingsGoalProgress), which were
--    already split so the identity-edit path never has to reason about
--    goal.completed/goal.progress_updated.
-- ============================================================================

-- Same dropped leftover-member freeze guard as planned_obligations above
-- (§2), same reasoning — not reproduced, was never a live authorization
-- gate.
DROP POLICY "savings_goals_update" ON savings_goals;
DROP POLICY "savings_goals_delete" ON savings_goals;

REVOKE ALL ON savings_goals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON savings_goals TO authenticated;

CREATE OR REPLACE FUNCTION update_savings_goal(
  p_id UUID,
  p_expected_version BIGINT,
  p_name TEXT,
  p_target_agorot BIGINT,
  p_account_id UUID,
  p_target_date DATE,
  p_icon TEXT,
  p_color TEXT
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

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_name');
  END IF;
  IF p_target_agorot IS NULL OR p_target_agorot <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM accounts WHERE id = p_account_id AND household_id = v_household_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
  END IF;

  UPDATE savings_goals
  SET name = btrim(p_name),
      target_agorot = p_target_agorot,
      account_id = p_account_id,
      target_date = p_target_date,
      icon = p_icon,
      color = p_color,
      version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version INTO v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM savings_goals WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION update_savings_goal(UUID, BIGINT, TEXT, BIGINT, UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_savings_goal(UUID, BIGINT, TEXT, BIGINT, UUID, DATE, TEXT, TEXT) TO authenticated;

-- update_savings_goal_progress(): the only writer of current_agorot.
-- is_completed stays derived exclusively by the pre-existing
-- derive_savings_goal_completion BEFORE INSERT OR UPDATE trigger (migration
-- 003), untouched here — it still fires during this statement. RETURNs
-- current_agorot/is_completed/version (not only version) so the client's
-- existing goal.completed vs. goal.progress_updated transition detection
-- (useUpdateSavingsGoalProgress.ts) keeps working unchanged against this
-- RPC's result the same way it did against the old raw
-- .update(...).select().single() call's result.
CREATE OR REPLACE FUNCTION update_savings_goal_progress(
  p_id UUID,
  p_expected_version BIGINT,
  p_current_agorot BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_household_id   UUID;
  v_rows           INT;
  v_new_version    BIGINT;
  v_current_agorot BIGINT;
  v_is_completed   BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT household_id INTO v_household_id FROM household_members WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF p_current_agorot IS NULL OR p_current_agorot < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  UPDATE savings_goals
  SET current_agorot = p_current_agorot,
      version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version, current_agorot, is_completed INTO v_new_version, v_current_agorot, v_is_completed;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM savings_goals WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'version', v_new_version,
    'currentAgorot', v_current_agorot, 'isCompleted', v_is_completed
  );
END;
$$;

REVOKE ALL ON FUNCTION update_savings_goal_progress(UUID, BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_savings_goal_progress(UUID, BIGINT, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION delete_savings_goal(
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

  DELETE FROM savings_goals
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM savings_goals WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_savings_goal(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_savings_goal(UUID, BIGINT) TO authenticated;

-- ============================================================================
-- 4. recurring_transactions — the deliberate asymmetry (ADR-036 §5). UPDATE
--    RLS stays open and unchanged (generate_recurring_transactions()/
--    skip_recurring_occurrence(), migration 003, are SECURITY INVOKER and
--    depend on it); enforcement is a trigger instead. DELETE has no
--    competing writer, so it IS closed the same way as the other two tables.
-- ============================================================================

DROP POLICY "recurring_delete" ON recurring_transactions;

-- REVOKE ALL then re-GRANT without DELETE — UPDATE is intentionally kept
-- (the recurring_update RLS policy itself is untouched).
REVOKE ALL ON recurring_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON recurring_transactions TO authenticated;

-- enforce_recurring_transaction_version(): fires on every UPDATE regardless
-- of caller (the RPCs below, or a hypothetical raw client update — RLS
-- UPDATE is still open for this table). Two rules, both required (design-
-- stage review finding — a purely conditional rule is not sufficient, see
-- this migration's header and ADR-036 §5):
--   (a) unconditional: version may only stay the same or advance by exactly
--       1, on ANY update — closes the "roll version backward/forward with no
--       protected column touched" bypass.
--   (b) conditional: if a human-editable column actually changed, version
--       MUST have advanced by exactly 1 (not merely stayed the same) —
--       closes the "change amount_agorot but never touch version" bypass.
-- next_due_date/last_generated_at (system-owned, advanced only by
-- generate_recurring_transactions()/skip_recurring_occurrence()) and
-- currency (no multi-currency support in MVP at all) are deliberately
-- excluded from the protected-column list — this trigger's condition (b)
-- never fires for either function's own writes, which only ever touch those
-- two system columns.
CREATE OR REPLACE FUNCTION enforce_recurring_transaction_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.version NOT IN (OLD.version, OLD.version + 1) THEN
    RAISE EXCEPTION 'recurring_transaction_version_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.account_id, NEW.category_id, NEW.amount_agorot, NEW.description, NEW.is_shared, NEW.frequency, NEW.day_of_month, NEW.is_active)
     IS DISTINCT FROM
     (OLD.account_id, OLD.category_id, OLD.amount_agorot, OLD.description, OLD.is_shared, OLD.frequency, OLD.day_of_month, OLD.is_active)
  THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'recurring_transaction_version_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_version BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_recurring_transaction_version();

-- Trigger-only function: nothing should ever call this directly (mirrors
-- migration 003's derive_savings_goal_completion()) — REVOKE from every
-- role, no GRANT.
REVOKE ALL ON FUNCTION enforce_recurring_transaction_version() FROM PUBLIC, anon, authenticated;

-- update_recurring_transaction(): SECURITY INVOKER — the caller's own RLS
-- (recurring_update, unchanged) already correctly scopes household
-- membership and the D2 account/category coherence checks; this RPC adds
-- only the atomic version compare-and-swap on top. No privilege escalation,
-- matching generate_recurring_transactions()'s own SECURITY INVOKER
-- precedent (migration 003).
CREATE OR REPLACE FUNCTION update_recurring_transaction(
  p_id UUID,
  p_expected_version BIGINT,
  p_account_id UUID,
  p_category_id UUID,
  p_amount_agorot BIGINT,
  p_description TEXT,
  p_is_shared BOOLEAN,
  p_frequency TEXT,
  p_day_of_month INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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
  IF p_amount_agorot IS NULL OR p_amount_agorot = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  -- frequency/day_of_month/account_id/category_id are pre-validated here even
  -- though recurring_update's own WITH CHECK (unchanged, still active since
  -- this is SECURITY INVOKER) would ultimately reject an invalid value too —
  -- without this, an invalid value surfaces as a raw constraint/RLS
  -- exception instead of the stable {ok:false, error:...} contract every
  -- other branch of this function returns (design brief §3D: the UI must
  -- never parse a raw Postgres error string).
  IF p_frequency NOT IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_frequency');
  END IF;
  IF p_day_of_month IS NOT NULL AND (p_day_of_month < 1 OR p_day_of_month > 31) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_day_of_month');
  END IF;
  IF p_account_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM accounts WHERE id = p_account_id AND household_id = v_household_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_account');
  END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM categories WHERE id = p_category_id AND (household_id = v_household_id OR household_id IS NULL)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_category');
  END IF;

  UPDATE recurring_transactions
  SET account_id = p_account_id,
      category_id = p_category_id,
      amount_agorot = p_amount_agorot,
      description = btrim(p_description),
      is_shared = p_is_shared,
      frequency = p_frequency,
      day_of_month = p_day_of_month,
      version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version INTO v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM recurring_transactions WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION update_recurring_transaction(UUID, BIGINT, UUID, UUID, BIGINT, TEXT, BOOLEAN, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_recurring_transaction(UUID, BIGINT, UUID, UUID, BIGINT, TEXT, BOOLEAN, TEXT, INTEGER) TO authenticated;

-- set_recurring_transaction_active(): the one-tap pause/resume action.
CREATE OR REPLACE FUNCTION set_recurring_transaction_active(
  p_id UUID,
  p_expected_version BIGINT,
  p_is_active BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
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

  UPDATE recurring_transactions
  SET is_active = p_is_active, version = version + 1
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version
  RETURNING version INTO v_new_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM recurring_transactions WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION set_recurring_transaction_active(UUID, BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_recurring_transaction_active(UUID, BIGINT, BOOLEAN) TO authenticated;

-- delete_recurring_transaction(): no competing writer for delete (generation/
-- skip never delete a template), so unlike UPDATE this IS closed at the RLS
-- layer and moved to a SECURITY DEFINER RPC, version-gated like every other
-- delete in this migration (design-stage review finding — a stale delete is
-- exactly as dangerous here as on the other two tables, and there is no
-- asymmetry-forcing reason to leave it unprotected the way UPDATE has one).
CREATE OR REPLACE FUNCTION delete_recurring_transaction(
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

  DELETE FROM recurring_transactions
  WHERE id = p_id AND household_id = v_household_id AND version = p_expected_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    IF EXISTS (SELECT 1 FROM recurring_transactions WHERE id = p_id AND household_id = v_household_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'conflict');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION delete_recurring_transaction(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION delete_recurring_transaction(UUID, BIGINT) TO authenticated;
