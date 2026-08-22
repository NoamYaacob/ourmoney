-- OurMoney — Migration 015: savings goal progress source (manual vs. linked
-- account)
--
-- Foundation item from the Israeli-household product-evolution audit (Phase
-- L — savings goals), per an explicit product decision:
--
--   "Yes, support linked-account-driven progress, but make it explicit and
--   opt-in. A savings goal should have a clear progress-source concept:
--   manual progress / linked account balance. Do not silently redefine
--   every existing linked goal. Existing goals should preserve their
--   current semantics/default safely. If linked account balance is
--   selected, use the eligible linked account's balance as the goal's
--   current progress and avoid double counting/manual progress ambiguity.
--   If one account can reasonably represent multiple goals, do not
--   automatically assign its full balance to multiple goals. Preserve a
--   safe/manual path instead."
--
-- savings_goals.account_id already existed (migration 002) but was purely
-- descriptive — no code anywhere derived current_agorot from it (confirmed
-- by the STEP 1 audit and re-verified directly against every call site in
-- features/savings/ before writing this migration). This migration adds the
-- explicit opt-in switch; it does not change what account_id already means.
--
-- ============================================================================
-- Part 1 — savings_goals.progress_source
-- ============================================================================
--
-- DEFAULT 'manual' + NOT NULL backfills every existing row to 'manual' as
-- part of this single ALTER TABLE — the exact "preserve current semantics
-- safely" requirement above, with no separate UPDATE needed.
ALTER TABLE savings_goals
  ADD COLUMN progress_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (progress_source IN ('manual', 'linked_account'));

-- A linked goal must actually point at an account — otherwise "use the
-- linked account's balance" has nothing to read.
ALTER TABLE savings_goals
  ADD CONSTRAINT savings_goals_linked_requires_account
    CHECK (progress_source = 'manual' OR account_id IS NOT NULL);

-- "Do not automatically assign its full balance to multiple goals" as a
-- real constraint, not just a UI convention that a second client (or a
-- direct API call) could bypass: at most one goal may have a given account
-- as its linked_account progress source at a time. A partial unique index
-- (not a full UNIQUE(account_id), which would also wrongly forbid two
-- different *manual* goals both merely referencing the same account
-- descriptively — that was already allowed before this migration and stays
-- allowed).
CREATE UNIQUE INDEX idx_savings_goals_linked_account_unique
  ON savings_goals(account_id)
  WHERE progress_source = 'linked_account';

-- ============================================================================
-- Part 2 — update_savings_goal(): accept progress_source, with the same
-- "safe/manual path" enforced server-side, not only in the UI
-- ============================================================================
--
-- Postgres identifies a function by name + parameter TYPE LIST, not just
-- name — adding a 9th parameter (even with a DEFAULT) makes this a
-- different signature from the migration 009 one, so CREATE OR REPLACE
-- alone would silently ADD an overload and leave the old 8-parameter
-- SECURITY DEFINER function (with none of this migration's validation)
-- callable forever. Drop the old signature explicitly first so exactly one
-- update_savings_goal ever exists. account_already_linked is a distinct,
-- catchable error code (not a raw unique_violation) so the client can show
-- a clear message and fall back to the manual path, matching "preserve a
-- safe/manual path instead."
DROP FUNCTION IF EXISTS update_savings_goal(UUID, BIGINT, TEXT, BIGINT, UUID, DATE, TEXT, TEXT);

CREATE OR REPLACE FUNCTION update_savings_goal(
  p_id UUID,
  p_expected_version BIGINT,
  p_name TEXT,
  p_target_agorot BIGINT,
  p_account_id UUID,
  p_target_date DATE,
  p_icon TEXT,
  p_color TEXT,
  p_progress_source TEXT DEFAULT 'manual'
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
  IF p_progress_source NOT IN ('manual', 'linked_account') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_progress_source');
  END IF;
  IF p_progress_source = 'linked_account' THEN
    IF p_account_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'linked_account_requires_account');
    END IF;
    IF EXISTS (
      SELECT 1 FROM savings_goals
      WHERE account_id = p_account_id AND progress_source = 'linked_account' AND id <> p_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'account_already_linked');
    END IF;
  END IF;

  UPDATE savings_goals
  SET name = btrim(p_name),
      target_agorot = p_target_agorot,
      account_id = p_account_id,
      target_date = p_target_date,
      icon = p_icon,
      color = p_color,
      progress_source = p_progress_source,
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

REVOKE ALL ON FUNCTION update_savings_goal(UUID, BIGINT, TEXT, BIGINT, UUID, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_savings_goal(UUID, BIGINT, TEXT, BIGINT, UUID, DATE, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- Part 3 — update_savings_goal_progress(): reject manual progress writes on
-- a linked goal
-- ============================================================================
--
-- "Avoid double counting/manual progress ambiguity": once a goal's progress
-- is derived from its linked account's balance, a manual current_agorot
-- write would silently disagree with that derivation the next time the UI
-- reads the account balance. Rejecting it here — not only hiding the manual
-- form in the UI — closes the same gap ADR-035's hard-block pattern closes
-- for transfer_id/obligation_id: a second, non-UI client cannot create the
-- inconsistency either.
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
  v_progress_source TEXT;
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

  SELECT progress_source INTO v_progress_source
  FROM savings_goals WHERE id = p_id AND household_id = v_household_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_progress_source = 'linked_account' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'progress_is_linked');
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
