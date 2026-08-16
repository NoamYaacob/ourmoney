-- OurMoney — Migration 007: Planned obligations (POST-MVP — Annual/future
-- expense planning foundation)
--
-- Adds a household-scoped model for a KNOWN future financial obligation —
-- ארנונה, ביטוח רכב, טסט לרכב, שכר לימוד, ועד בית, and similar dated,
-- amounted commitments that are not a recurring monthly payment
-- (recurring_transactions, migration 002) and not a movement of money that
-- already happened (transactions, migration 002). FEATURES.md already names
-- exactly this gap: "Future obligation calendar | [BLOCKED: forward model]"
-- and "Annual expense planning | [NEXT]" — this migration is that forward
-- model. It is intentionally the smallest table that can answer the four
-- questions the eventual Safe-to-Spend formula needs from it (amount,
-- due_date, status, household ownership) without guessing at anything
-- beyond that — see this table's own column-by-column comments below for
-- what was deliberately left out and why.
--
-- Model decision: a NEW table, not an extension of recurring_transactions
-- and not a repurposing of savings_goals or budget_allocations.
--   - recurring_transactions models a PATTERN that generates real
--     transactions on a schedule (frequency, day_of_month, next_due_date,
--     last_generated_at) — its whole shape assumes indefinite repetition.
--     Forcing a one-time "ארנונה due 10/09/2026" through that model would
--     mean inventing a fake "frequency" for something that only happens
--     once, exactly the kind of semantic mismatch CLAUDE.md's transaction-
--     identity discipline (ADR-029) warns against for a different table.
--   - savings_goals models progress TOWARD an amount (current_agorot vs.
--     target_agorot, is_completed derived from that comparison, migration
--     003's trigger). A planned obligation is not saved toward — it is
--     owed, in full, once, on a date.
--   - budget_allocations models a per-category monthly SPENDING CAP, not a
--     dated, named, individually-tracked commitment.
-- None of the three fits. planned_obligations is its own table, deliberately
-- kept close to savings_goals' shape (simple, household-scoped, optional
-- account_id, a status column instead of savings_goals' derived boolean)
-- since that is the closest existing precedent for "a standalone financial
-- intent that is not itself a transaction."
--
-- Explicitly one-time only in this milestone (no recurrence column) — the
-- task's own fallback ("keep this milestone one-time obligations only" if
-- recurrence doesn't fit cleanly) is exercised deliberately: recurrence
-- belongs to recurring_transactions' existing, already-tested engine, and
-- duplicating a second frequency/next-due-date concept here would be the
-- exact "force it into recurring transactions" (or vice versa) mistake this
-- migration's own task explicitly warned against in the other direction.
--
-- No transaction-generation column (e.g. a linked transaction_id) is added
-- here either — "mark paid" in this milestone is a status transition only
-- (status -> 'completed'), not a transaction-creating action. Generating a
-- real transaction from an obligation, with confirmation, is documented as
-- the deliberate next step (see the app-layer PR description / final
-- report), not implemented now, per this task's own explicit permission to
-- ship completion-state first when the fuller flow would make the
-- milestone too large. Adding an unused nullable link column now, before
-- any code populates it, would be exactly the "no speculative fields"
-- rule this task also states — a future additive migration can add it
-- alongside the code that actually uses it.
--
-- RLS/grants/coherence follow savings_goals' migration-002-plus-004-
-- corrected shape exactly (is_household_member, D2 category_id/account_id
-- coherence, created_by nullable + ON DELETE SET NULL from creation — never
-- retrofitted the way recurring_transactions/savings_goals needed migration
-- 004 to relax them). leave_household() and delete_own_account()
-- (migration 005, their current live versions) are both widened by one line
-- each so a departing member's attribution is nulled here exactly as it
-- already is for every other created_by column on every other financial
-- table — see Part 2/Part 3 below for why both functions need it (not just
-- one).

-- ============================================================================
-- Part 1 — planned_obligations table
-- ============================================================================

CREATE TABLE planned_obligations (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  -- Always positive — an obligation is an amount owed, not a signed ledger
  -- movement (unlike transactions.amount_agorot, which is signed and can be
  -- income). Matches budget_allocations' CHECK (amount_agorot > 0), not
  -- transactions'/recurring_transactions' CHECK (amount_agorot <> 0).
  amount_agorot  BIGINT      NOT NULL CHECK (amount_agorot > 0),
  -- The date the obligation is due — not a movement date (no transaction
  -- exists yet), so this is its own column, not txn_date reused.
  due_date       DATE        NOT NULL,
  category_id    UUID        REFERENCES categories(id),
  account_id     UUID        REFERENCES accounts(id),
  -- BUDGET ATTRIBUTION ONLY, same meaning and same discipline as
  -- transactions.is_shared (CLAUDE.md: never overload a boolean for
  -- visibility). Every household member can see every obligation in MVP
  -- regardless of this value — this only distinguishes shared vs. personal
  -- for whatever future aggregate (e.g. Safe-to-Spend) reads it.
  is_shared      BOOLEAN     NOT NULL DEFAULT TRUE,
  notes          TEXT,
  status         TEXT        NOT NULL DEFAULT 'upcoming'
                              CHECK (status IN ('upcoming', 'completed', 'cancelled')),
  -- Nullable + ON DELETE SET NULL from creation (unlike the original
  -- migration-002 drafts of recurring_transactions.created_by/
  -- savings_goals.created_by, which were NOT NULL and had to be relaxed by
  -- migration 004 after the fact). Written correctly from day one here:
  -- attribution/provenance metadata, never an authorization gate (RLS
  -- conditions only on is_household_member(household_id) below).
  created_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON planned_obligations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Due-date-ordered "upcoming obligations" is the only query shape the UI
-- needs (app/(app)/obligations/index.tsx: household_id = X AND status =
-- 'upcoming' ORDER BY due_date ASC). The partial index matches that
-- predicate exactly and stays small as completed/cancelled rows accumulate;
-- the plain composite index covers the full-history / non-upcoming reads
-- (e.g. a detail screen listing past obligations) without needing a second
-- full-table scan path.
CREATE INDEX idx_planned_obligations_household_due ON planned_obligations(household_id, due_date);
CREATE INDEX idx_planned_obligations_upcoming ON planned_obligations(household_id, due_date)
  WHERE status = 'upcoming';

ALTER TABLE planned_obligations ENABLE ROW LEVEL SECURITY;

-- D2 coherence (same shape as savings_goals_insert/_update, migration 002):
-- category_id must be a system category or belong to this household;
-- account_id must belong to this household. Without these, a member could
-- point either at another household's row via the FK alone — not a data
-- leak (both target tables have their own household-scoped RLS), but the
-- same integrity gap D2 closes everywhere else on every other financial
-- table.
CREATE POLICY "planned_obligations_select" ON planned_obligations
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "planned_obligations_insert" ON planned_obligations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = planned_obligations.household_id OR categories.household_id IS NULL)
    )
    AND (
      account_id IS NULL
      OR account_id IN (SELECT id FROM accounts WHERE accounts.household_id = planned_obligations.household_id)
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "planned_obligations_update" ON planned_obligations
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = planned_obligations.household_id OR categories.household_id IS NULL)
    )
    AND (
      account_id IS NULL
      OR account_id IN (SELECT id FROM accounts WHERE accounts.household_id = planned_obligations.household_id)
    )
    AND (
      created_by IS NULL
      OR created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = planned_obligations.household_id)
    )
  );

CREATE POLICY "planned_obligations_delete" ON planned_obligations
  FOR DELETE TO authenticated USING (is_household_member(household_id));

-- Same rationale as migration 001 §10b / migration 002 §12: PostgREST
-- checks GRANTs before RLS, and Supabase's local Postgres grants table-wide
-- TRUNCATE/REFERENCES/TRIGGER to anon/authenticated by default on every new
-- table regardless of RLS. REVOKE ALL then GRANT only what the policies
-- above actually permit.
REVOKE ALL ON planned_obligations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON planned_obligations TO authenticated;

-- ============================================================================
-- Part 2 — leave_household() (migration 005, current live version): null
-- planned_obligations.created_by for the departing member, same as every
-- other attribution-only column this function already handles.
-- ============================================================================
--
-- Required here for the same reason migration 005's header explains for the
-- other six tables: this function never touches auth.users (the caller
-- keeps their account), so the ON DELETE SET NULL FK never fires on its
-- own. Without this explicit UPDATE, a departing member's
-- planned_obligations rows would keep created_by pointing at a user who is
-- no longer is_household_member() for this household — not an RLS/security
-- gap (created_by is not read by any policy's USING/WITH CHECK gate outside
-- this exact nulling purpose), but it would leave this table as the one
-- exception to a pattern every other financial table in this function
-- already follows, and a future UPDATE by a remaining member would hit the
-- same "created_by IN (SELECT user_id FROM household_members ...) reads
-- FALSE forever" freeze migration 004 Part 2 fixed everywhere else if this
-- table's own planned_obligations_update policy is ever tightened to rely
-- on it more strictly than the already-permissive IS NULL branch above.
-- Every executable statement is unchanged from migration 005's version,
-- with exactly one added statement (the new UPDATE planned_obligations
-- block, placed immediately after the existing UPDATE savings_goals
-- block) — confirmed by diffing this function body against migration
-- 005's. Some of migration 005's own inline comments (e.g. the "Safe to
-- read without a lock" and "FOR UPDATE is required, not optional" notes)
-- are not repeated here to keep this addition focused; see migration
-- 005's file for that reasoning, which still applies unchanged.
-- Migrations are immutable in this project's convention; re-creating the
-- function here (not editing migration 005's file) is the established way
-- to widen it, exactly as migration 005 itself did to migration 004's
-- version.
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

-- ============================================================================
-- Part 3 — delete_own_account() (migration 005, current live version): same
-- addition, for consistency with every other table's treatment in this
-- function.
-- ============================================================================
--
-- Technically redundant with Part 1's ON DELETE SET NULL FK: this function's
-- final DELETE FROM auth.users always runs (unconditionally, regardless of
-- branch), and that alone would null planned_obligations.created_by via the
-- FK exactly as it already does for households.created_by/accounts.owner_id/
-- transactions.created_by/recurring_transactions.created_by/
-- savings_goals.created_by (all six of those ALSO have ON DELETE SET NULL,
-- per migration 004 Part 1) — meaning every existing explicit UPDATE in
-- this function's continuing-household branch is, in the same sense,
-- already redundant with that same final cascade, and none of them were
-- removed for it. Added here to match that established, deliberate
-- redundancy rather than make planned_obligations the one table this
-- function treats differently from its six siblings and from
-- leave_household() above. Every executable statement is unchanged from
-- migration 005's version, with exactly one added statement (the new
-- UPDATE planned_obligations block, placed immediately after the existing
-- UPDATE savings_goals block) — confirmed by diffing this function body
-- against migration 005's.
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
