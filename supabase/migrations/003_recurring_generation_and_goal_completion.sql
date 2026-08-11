-- OurMoney — Migration 003: Recurring generation + savings-goal completion (MVP-3)
--
-- Adds three new callable functions and one trigger, on top of migration
-- 002's already-shipped recurring_transactions/savings_goals schema+RLS
-- (D1 — schema only in Milestone 6, first consumed here). No table, column,
-- or RLS policy changes to any existing table other than the one additive
-- trigger below on savings_goals.
--
-- This is a faithful implementation of the M7 recurring-generation design
-- approved after correction (see the milestone planning conversation):
--
--   The client sends NOTHING generation-specific. generate_recurring_
--   transactions() takes zero parameters — it resolves the caller's
--   household, locks every due active template (SELECT ... FOR UPDATE, a
--   stable id order to avoid deadlocking a concurrent call from the other
--   household member), and generates every missed occurrence per template
--   SEQUENTIALLY inside the loop, always re-reading the template's own
--   day_of_month/frequency/amount/account/category/description/is_shared —
--   never trusting client input for any of it. Idempotency comes from the
--   row lock + re-read under READ COMMITTED, not from a client-supplied
--   idempotency key or a client-precomputed batch: a concurrent or replayed
--   call simply blocks until the first commits, then re-reads the
--   already-advanced next_due_date and finds nothing left to do for that
--   template.
--
--   skip_recurring_occurrence(p_recurring_id) is a separate, explicit,
--   single-shot action (the "skip a single occurrence" feature) — it
--   advances next_due_date by exactly one period with no transaction
--   generated, reusing the same server-side date-advancement logic.
--
--   advance_recurring_due_date() is a small, pure SQL helper implementing
--   the day-of-month clamp (31st -> Feb 28/29, 31st -> 30th, etc.), always
--   re-deriving from the ORIGINAL stored day_of_month rather than the
--   previous computed due date so a 31st-of-month template returns to the
--   31st in March rather than drifting to the 28th forever. Its TypeScript
--   mirror (features/recurring/lib/recurringDueDate.ts) is the tested
--   reference implementation used only for client-side preview display —
--   this SQL function is authoritative for the actual mutation. Parity
--   between the two is proven by running the identical fixture table
--   against both (recurringDueDate.test.ts here; the DB.PARITY.* group in
--   rls_tests.sql calling this function directly).
--
--   derive_savings_goal_completion() is a BEFORE INSERT OR UPDATE trigger
--   on savings_goals, unconditionally setting
--   is_completed := current_agorot >= target_agorot on every write — the
--   single source of truth for that column, regardless of which code path
--   writes current_agorot. A client-supplied is_completed value in an
--   INSERT/UPDATE payload is silently overridden by this trigger (proven by
--   a dedicated rls_tests.sql test), which is the point: no application
--   code should ever set is_completed directly, and none does.
--
-- Every function below has an explicit, fixed `SET search_path = public,
-- pg_temp` (including the trigger function and the pure SQL helper — not
-- only the two RPCs), matching the convention already established by every
-- function in migrations 001/002. Every callable function gets an explicit
-- REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;
-- pair; the trigger function gets REVOKE ALL FROM PUBLIC, anon,
-- authenticated with NO grant at all (mirrors migration 001's
-- handle_new_user() — nothing should ever call a trigger function directly).

-- ============================================================================
-- 1. advance_recurring_due_date() — pure date-advancement helper
-- ============================================================================
-- No table access, so no SECURITY DEFINER/INVOKER distinction applies — it
-- runs with whatever privileges the calling context already has. IMMUTABLE
-- since it is a pure function of its three arguments.

CREATE OR REPLACE FUNCTION advance_recurring_due_date(
  p_due_date DATE,
  p_frequency TEXT,
  p_day_of_month INTEGER
)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE p_frequency
    WHEN 'daily'    THEN p_due_date + 1
    WHEN 'weekly'   THEN p_due_date + 7
    WHEN 'biweekly' THEN p_due_date + 14
    ELSE ( -- monthly / quarterly / yearly: step N months, clamp to day_of_month
      WITH step AS (
        SELECT CASE p_frequency
          WHEN 'monthly'   THEN 1
          WHEN 'quarterly' THEN 3
          WHEN 'yearly'    THEN 12
        END AS n
      ), target_month AS (
        SELECT (date_trunc('month', p_due_date) + (step.n || ' months')::interval)::date AS start
        FROM step
      )
      SELECT target_month.start + (LEAST(
        p_day_of_month,
        ((date_trunc('month', target_month.start) + interval '1 month - 1 day')::date
          - date_trunc('month', target_month.start)::date + 1)::integer
      ) - 1)
      FROM target_month
    )
  END;
$$;

REVOKE ALL ON FUNCTION advance_recurring_due_date(DATE, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_recurring_due_date(DATE, TEXT, INTEGER) TO authenticated;

-- ============================================================================
-- 2. derive_savings_goal_completion() — trigger, single source of truth for
--    savings_goals.is_completed
-- ============================================================================

CREATE OR REPLACE FUNCTION derive_savings_goal_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.is_completed := NEW.current_agorot >= NEW.target_agorot;
  RETURN NEW;
END;
$$;

CREATE TRIGGER derive_completion BEFORE INSERT OR UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION derive_savings_goal_completion();

-- Trigger-only function: nothing should ever call this directly (mirrors
-- migration 001's handle_new_user()) — REVOKE from every role, no GRANT.
REVOKE ALL ON FUNCTION derive_savings_goal_completion() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. generate_recurring_transactions() — automatic, whole-household,
--    catch-up-safe recurring generation
-- ============================================================================
-- SECURITY INVOKER — every INSERT into transactions and UPDATE of
-- recurring_transactions below still runs under the caller's own RLS
-- (including migration 002's D2 household-coherence WITH CHECK clauses on
-- transactions_insert) — no bypass, no privilege escalation. Household is
-- resolved server-side from household_members via auth.uid(); there is no
-- household-id parameter, matching save_budget_allocations' precedent.

CREATE OR REPLACE FUNCTION generate_recurring_transactions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_template     RECORD;
  v_new_due_date DATE;
  v_transaction_id UUID;
  v_results      JSONB := '[]'::jsonb;
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

  -- Lock every due, active template up front, in a stable order (id) so a
  -- concurrent call from the other household member cannot deadlock
  -- against this one — it simply blocks on the row lock until this call's
  -- transaction commits, then (under READ COMMITTED) re-reads the
  -- already-advanced row and finds nothing left to do. This row-lock +
  -- re-read behavior IS the idempotency/concurrency guarantee; there is no
  -- separate match-check against client-supplied state, because there is
  -- no client-supplied state.
  FOR v_template IN
    SELECT * FROM recurring_transactions
    WHERE household_id = v_household_id
      AND is_active = TRUE
      AND next_due_date <= CURRENT_DATE
    ORDER BY id
    FOR UPDATE
  LOOP
    -- Sequentially generate every missed occurrence for this template.
    -- advance_recurring_due_date is always called with v_template's own,
    -- unchanging day_of_month — never with a value derived from the
    -- previous computed due date — so a 31st-of-month template returns to
    -- the 31st in March rather than drifting to the 28th after February.
    WHILE v_template.next_due_date <= CURRENT_DATE LOOP
      INSERT INTO transactions (
        household_id, account_id, category_id, recurring_id,
        amount_agorot, currency, description, is_shared, txn_date, source, created_by
      ) VALUES (
        v_household_id, v_template.account_id, v_template.category_id, v_template.id,
        v_template.amount_agorot, v_template.currency, v_template.description, v_template.is_shared,
        v_template.next_due_date, 'recurring', v_user_id
      ) RETURNING id INTO v_transaction_id;

      v_new_due_date := advance_recurring_due_date(
        v_template.next_due_date, v_template.frequency, v_template.day_of_month
      );

      UPDATE recurring_transactions
      SET next_due_date = v_new_due_date, last_generated_at = NOW()
      WHERE id = v_template.id;

      v_results := v_results || jsonb_build_object(
        'recurringId', v_template.id,
        'transactionId', v_transaction_id,
        'txnDate', v_template.next_due_date
      );

      v_template.next_due_date := v_new_due_date;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results);
END;
$$;

REVOKE ALL ON FUNCTION generate_recurring_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_recurring_transactions() TO authenticated;

-- ============================================================================
-- 4. skip_recurring_occurrence() — explicit single-occurrence skip
-- ============================================================================
-- Separate from generate_recurring_transactions() by design: skipping is a
-- deliberate, single, user-initiated action, not part of the automatic
-- catch-up loop. Reuses the identical server-side date-advancement logic.
-- Only applies to an ACTIVE template — an inactive or inaccessible
-- (not-a-member's) row returns the same generic not_found response and its
-- next_due_date is left untouched, rather than silently advancing a
-- template the household has paused.

CREATE OR REPLACE FUNCTION skip_recurring_occurrence(p_recurring_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_new_due_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_row
  FROM recurring_transactions
  WHERE id = p_recurring_id AND is_active = TRUE
  FOR UPDATE;
  -- RLS's recurring_select policy already restricts this SELECT to the
  -- caller's own household — NOT FOUND covers both "does not exist," "not a
  -- member of this household," and "exists but is_active = FALSE"
  -- uniformly, by design: an inactive template must not be skippable, and
  -- must not leak whether it exists via a different error shape.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_new_due_date := advance_recurring_due_date(v_row.next_due_date, v_row.frequency, v_row.day_of_month);

  UPDATE recurring_transactions
  SET next_due_date = v_new_due_date
  WHERE id = p_recurring_id;

  RETURN jsonb_build_object('ok', true, 'newNextDueDate', v_new_due_date);
END;
$$;

REVOKE ALL ON FUNCTION skip_recurring_occurrence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION skip_recurring_occurrence(UUID) TO authenticated;
