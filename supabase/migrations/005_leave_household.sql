-- OurMoney — Migration 005: Leave household (admin-safe)
--
-- Adds a real "leave household without deleting your account" RPC —
-- explicitly named as deferred future work in docs/DECISIONS.md ADR-032:
-- "Closing it (routing a voluntary 'leave' through the same
-- succession/cascade logic delete_own_account() uses) is a reasonable
-- future addition but is account-lifecycle scope beyond account
-- *deletion*, which is what [migration 004] was scoped to." This
-- migration is exactly that. leave_household() reuses delete_own_account()'s
-- admin-succession and sole-member-cascade decisions verbatim, extended to
-- the one way this action differs: the caller's own auth.users row is
-- never touched — they keep their account, they simply stop being a
-- member of this household.
--
-- Three decisions, mirroring migration 004's exactly:
--
--   1. A regular member leaves: a plain household_members row delete,
--      nothing else changes. Functionally unchanged from the raw
--      household_members_delete RLS policy behavior the client's
--      useRemoveHouseholdMember hook already uses for this exact case
--      (see that hook's header comment) — routing it through this RPC
--      instead is done for UI consistency (both "leave" and "remove
--      member" now share one code path client-side), not because the
--      member case needed new safety logic.
--   2. An admin leaves a multi-member household: the longest-tenured
--      remaining member (MIN(joined_at)) is auto-promoted to admin,
--      atomically, then the departing admin's own membership row is
--      deleted. Every attribution-only FK the departing admin left behind
--      in this household (households.created_by, invitations.invited_by,
--      accounts.owner_id, transactions.payer_id/created_by,
--      recurring_transactions.created_by, savings_goals.created_by) is
--      nulled — NOT because deleting auth.users needs it this time (their
--      account isn't being deleted, so migration 004's ON DELETE SET NULL
--      FK behavior never fires here), but because the exact same D2/WITH
--      CHECK regression migration 004 Part 2 fixed would otherwise
--      reappear through a different door: `created_by IN (SELECT user_id
--      FROM household_members WHERE household_id = ...)` reads FALSE the
--      instant the departing admin's own membership row is gone, which
--      would freeze every row they ever created for every remaining
--      member, forever, with no delete_own_account() call ever going to
--      trigger the FK's automatic SET NULL for them. Migration 004 Part 2
--      already widened the relevant WITH CHECK clauses to accept
--      `created_by IS NULL` — this function is what actually produces
--      that NULL for a plain leave.
--   3. A sole member leaves (necessarily also the household's only admin):
--      the household is deleted outright, exactly like
--      delete_own_account()'s sole-member branch (migration 004,
--      decision 2) — an unreachable, member-less household would be
--      exactly the same permanent, RLS-orphaned garbage row that decision
--      exists to prevent, and this code path can produce the identical
--      state. household_id ON DELETE CASCADE removes every row that
--      belonged to it. The caller's own account is untouched; they simply
--      have no household anymore, same as a fresh signup.
--
-- Explicitly NOT auto-deleting the caller's account in any branch above —
-- that remains delete_own_account()'s job, a different, explicit, opt-in
-- action with its own confirmation UI ("Delete account" in Settings).
--
-- Locking: reuses delete_own_account()'s exact advisory-lock CLASS (72702),
-- not a new one — deliberately, not an oversight. Both functions protect
-- the identical resource (a consistent view of household_members for a
-- given household_id, for admin-succession/cascade purposes), so they must
-- share a lock key to actually serialize against each other; a *different*
-- class would let a concurrent leave_household() and delete_own_account()
-- call for the same household both read pre-lock state and disagree about
-- who the successor is. (72701, create_household()/accept_invitation()'s
-- namespace, protects a genuinely different resource — per-user
-- membership existence, keyed on user_id — so it stays separate.)
--
-- Security posture, matching delete_own_account() exactly: zero
-- parameters (the only user this function can ever affect is auth.uid()
-- itself — no parameter through which a caller could target another
-- user's membership), SECURITY DEFINER (promoting a member to admin has
-- no UPDATE policy at all, ADR-022, deliberately — this is that "audited
-- SECURITY DEFINER function"), fixed search_path, EXECUTE revoked from
-- PUBLIC/anon and granted only to authenticated. No service-role key is
-- used or exposed anywhere.
--
-- CORRECTED during database-security-reviewer review of this migration
-- (the review this exact file's own commit went through before shipping —
-- not a hypothetical): an earlier draft of this header claimed the
-- client's "admin removes a member" affordance (useRemoveHouseholdMember.ts,
-- a plain RLS-gated DELETE that takes none of this function's locks) "can
-- never race this function's succession logic... it only ever targets a
-- non-admin row." That reasoning was wrong — the succession CANDIDATE
-- selected by decision 2 above (the longest-tenured remaining member) is
-- itself a non-admin row, exactly the kind of row that raw DELETE is
-- allowed to target. Concretely: this function's advisory lock (72702)
-- only serializes calls to THIS function (and delete_own_account())
-- against each other; it does nothing against that separate, unlocked raw
-- DELETE. If it removes the selected candidate between this function's
-- SELECT and its UPDATE, the promotion UPDATE becomes a silent 0-row
-- no-op — this function would have returned {ok:true, new_admin_id: X}
-- for a user who was never actually promoted, leaving the household with
-- zero admins, permanently (only a departing ADMIN's leave/delete ever
-- triggers promotion — with none left, nothing can ever promote anyone
-- again). Fixed two ways, both below, not one:
--   (a) FOR UPDATE on the succession-candidate SELECT (both in this
--       function and, Part 2 below, in delete_own_account() — the
--       identical unlocked SELECT-then-UPDATE shape existed there first
--       and is fixed here too, not deferred, since Phase A's stated goal
--       of "prevent concurrent leaving from producing zero admins" is not
--       met while the sibling function keeps the same hole reachable).
--       Blocks until any concurrent DELETE on that exact row resolves,
--       and Postgres re-evaluates row visibility afterward: a vanished
--       candidate is skipped in favor of the next-longest-tenured one
--       still present, rather than being silently "promoted" as a ghost.
--   (b) Part 3 below tightens household_members_delete so an admin's own
--       row can no longer be self-deleted via that raw policy at all —
--       closing the separate, even more direct gap the same review found:
--       nothing previously stopped an admin from bypassing both
--       succession-aware functions entirely via a raw DELETE on their own
--       row.
--
-- Test coverage for the fix: 8.13 (supabase/rls_tests.sql) proves the
-- "skip a vanished top candidate, promote the next one" behavior
-- deterministically (removes the would-be successor before calling this
-- function, no concurrency needed to demonstrate the logic itself). The
-- true-concurrency shape of the original bug — this function's SELECT and
-- a separate, real, simultaneously-committing raw DELETE transaction —
-- genuinely cannot be proven without a live database and is NOT covered by
-- a dblink test in this migration; LEAVE.CONCURRENT only races two
-- leave_household() calls against each other (both lock-participating),
-- not this function against the non-participating raw DELETE path. Flagged
-- here rather than silently left uncovered.
--
-- NEEDS LIVE VERIFICATION (cannot be proven in a sandbox without
-- Docker/Supabase — flagged honestly per this project's standing rule for
-- every schema-touching migration where the DB gate could not actually
-- run, same as migration 004's own equivalent note): that this function's
-- promotion/cascade paths behave identically to delete_own_account()'s
-- under real Postgres/PostgREST, that FOR UPDATE's skip-the-vanished-
-- candidate behavior is exactly as documented above under this project's
-- actual Postgres version, and — most importantly, given the finding this
-- section documents — the true concurrent-transaction interleaving between
-- this function and the raw "remove member" DELETE, which no test in this
-- repository actually exercises live.

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

  -- Safe to read without a lock, same reasoning as delete_own_account():
  -- household_id never changes on an existing membership row, and only
  -- this user's own leave/removal ever removes their own row.
  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  -- Same class (72702) as delete_own_account() — see this migration's
  -- header for why that is required, not incidental. Released
  -- automatically at transaction end.
  PERFORM pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

  -- Re-read fresh, now that the lock is held — a concurrent call (an
  -- admin's raw "remove member" delete racing this same user, or another
  -- member of this household calling delete_own_account()/
  -- leave_household() themselves) may have changed this user's role, or
  -- removed their row entirely, while this call waited for the lock.
  SELECT role INTO v_role
  FROM household_members
  WHERE household_id = v_household_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    -- Already removed by a concurrent action between the initial unlocked
    -- read above and acquiring the lock. Idempotent success, not an error
    -- — the caller's goal (not being a member of this household) is
    -- already achieved.
    RETURN jsonb_build_object('ok', true, 'household_deleted', false, 'new_admin_id', NULL);
  END IF;

  SELECT COUNT(*) INTO v_other_member_count
  FROM household_members
  WHERE household_id = v_household_id AND user_id <> v_user_id;

  IF v_other_member_count = 0 THEN
    -- Decision 3: sole member (necessarily the sole admin) leaving.
    -- household_id ON DELETE CASCADE (migrations 001/002) removes every
    -- account/category/category_rule/transaction/recurring_transaction/
    -- budget/budget_allocation/savings_goal/invitation/membership row that
    -- belonged to it, including this user's own now-redundant
    -- household_members row, in this same statement. auth.users is never
    -- touched.
    DELETE FROM households WHERE id = v_household_id;
    v_household_deleted := TRUE;
  ELSE
    IF v_role = 'admin' THEN
      -- Decision 2: auto-promote the longest-tenured remaining member.
      -- FOR UPDATE is required, not optional — see this migration's
      -- header ("row lock on the succession candidate") for the concrete
      -- race it closes: the 72702 advisory lock only serializes calls to
      -- THIS function (and delete_own_account()) against each other; it
      -- does nothing against the client's separate, unlocked "admin
      -- removes a member" raw DELETE (useRemoveHouseholdMember.ts), which
      -- can target this exact candidate row at any moment. Without FOR
      -- UPDATE, that raw DELETE could commit between this SELECT and the
      -- UPDATE below, making the UPDATE a silent 0-row no-op — reporting
      -- new_admin_id as a user who was never actually promoted, leaving
      -- the household with zero admins. FOR UPDATE blocks until any such
      -- concurrent DELETE resolves, and Postgres re-evaluates row
      -- visibility afterward: if the candidate was deleted, the
      -- ORDER BY/LIMIT plan moves on to the next-longest-tenured
      -- candidate still in the table, rather than promoting a row that no
      -- longer exists.
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
        -- Every other candidate vanished (via the same raced raw delete)
        -- between the other-member-count check above and this select.
        -- Correctly report no promotion rather than a false one; the
        -- caller's own row is still removed below, same as any other
        -- non-sole-member departure -- a legitimate but rare outcome
        -- (household briefly has zero admins until another admin action
        -- restores one), strictly better than the false-success this
        -- fix replaces.
        v_new_admin_id := NULL;
      END IF;
    END IF;

    -- Null every attribution-only FK this user leaves behind — required
    -- here (see header) even though auth.users is never touched, because
    -- RLS's WITH CHECK on created_by/payer_id (migration 004 Part 2) reads
    -- current household_members membership, which this user is about to
    -- no longer be part of.
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
-- Part 2 — delete_own_account() (migration 004) gets the identical
-- succession-candidate FOR UPDATE fix.
-- ============================================================================
--
-- database-security-reviewer finding while authoring this migration: the
-- race the FOR UPDATE fix above closes is not specific to leave_household()
-- — delete_own_account()'s admin-succession branch (migration 004) has the
-- exact same unlocked SELECT-then-UPDATE shape, and is raceable against the
-- same unlocked "admin removes a member" raw DELETE the same way. This is a
-- real, previously-unnamed gap in already-shipped code, not a leave-
-- household-specific issue, and it is fixed here (re-creating the function
-- with the fix, not editing migration 004's file — migrations are an
-- immutable historical record in this project's convention) rather than
-- deferred, since Phase A's own scope ("prevent concurrent leaving from
-- producing zero admins") is not actually met while the identical
-- vulnerability remains reachable via the sibling function. No other
-- change from migration 004's version — see that migration and
-- docs/DECISIONS.md ADR-032 for everything else about this function.
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
        -- FOR UPDATE — see leave_household()'s identical comment above for
        -- the exact race this closes.
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

-- ============================================================================
-- Part 3 — household_members_delete tightened: an admin can no longer
-- self-remove via the raw policy, only through leave_household() /
-- delete_own_account().
-- ============================================================================
--
-- database-security-reviewer finding: the original policy (migration 001)
-- — USING (user_id = auth.uid() OR is_household_admin(household_id)) —
-- lets ANY user, including a household's sole admin, delete their own
-- household_members row directly via a plain authenticated REST call, no
-- service-role key needed, completely bypassing both succession-aware
-- functions above. ADR-032/ADR-034 both named this as "latent, not live —
-- no UI calls it," but that is a client-side convention, not a server-side
-- boundary, and this migration is the first point where a real, correct
-- RPC path for "admin leaves" exists and should be the *only* path for an
-- admin's own row. Narrowed so a self-delete is only permitted when the
-- caller is NOT that household's admin (the already-safe member-leaves-raw
-- case, unchanged) — an admin's own row can now only ever be removed by
-- the SECURITY DEFINER functions above, which bypass RLS entirely for
-- their own writes and so are unaffected by this policy change. An admin
-- removing a DIFFERENT member's row (is_household_admin branch) is
-- unchanged and still requires user_id <> auth.uid() to be reachable at
-- all for an admin's own row via that branch (previously true implicitly
-- since is_household_admin(household_id) does not check the target row's
-- own role; the AND user_id <> auth.uid() below is what actually closes
-- the gap for a self-targeting admin call through that branch too).
DROP POLICY "household_members_delete" ON household_members;
CREATE POLICY "household_members_delete" ON household_members
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND role <> 'admin')
    OR (is_household_admin(household_id) AND user_id <> auth.uid())
  );
