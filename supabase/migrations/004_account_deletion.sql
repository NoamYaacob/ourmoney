-- OurMoney — Migration 004: Account deletion (MVP-4 — Ship Quality / Milestone 9)
--
-- Adds the self-service account-deletion flow required for App Store / Play
-- Store compliance (PROJECT_SPEC.md § Settings, "Delete account"). Resolves
-- T-Q1 in docs/TRUST_AND_PRIVACY.md ("What happens to shared household data
-- when one member leaves or a household dissolves?") — the decisions below
-- were confirmed explicitly during Milestone 9 planning, not invented here.
-- See docs/DECISIONS.md ADR-032 for the full rationale.
--
-- Three product decisions, confirmed before this file was written:
--
--   1. Admin succession: if the deleting user is the household's admin and
--      other members remain, the longest-tenured remaining member
--      (MIN(joined_at)) is auto-promoted to admin, atomically, in the same
--      function call. household_members still has no client-writable
--      UPDATE policy (ADR-022) — this is exactly the "another audited
--      SECURITY DEFINER function" ADR-022 names as the only legitimate way
--      to ever change a role.
--   2. Sole-member households: once the last member is gone, RLS makes the
--      household permanently unreachable (every policy requires
--      is_household_member). The household row itself is deleted, and
--      household_id ON DELETE CASCADE (already in place on every financial
--      table since migrations 001/002) removes everything that belonged to
--      it in the same statement.
--   3. Attribution vs. ownership: money belongs to household_id, not to the
--      user who happened to create a row (CLAUDE.md, DATABASE_SCHEMA.md).
--      When a household continues after a member's departure, every
--      attribution-only FK pointing at that user (households.created_by,
--      invitations.invited_by, transactions.created_by/payer_id,
--      recurring_transactions.created_by, savings_goals.created_by) is
--      nulled, never used to delete or hide shared data. A departing
--      member's personal accounts (accounts.owner_id = them) convert to
--      household-owned (owner_id -> NULL) rather than being deleted, so
--      balances and historical budget totals stay correct for the
--      remaining members.
--
-- What this migration does NOT do: it does not add a "leave household
-- without deleting your account" UI/RPC. The existing household_members_delete
-- policy (migration 001) already technically permits a raw self-removal
-- (`user_id = auth.uid()`), but that path predates this migration and still
-- has no admin-succession or orphan-prevention logic of its own — no UI in
-- the app calls it today. Closing that gap is out of scope for this
-- migration (account deletion, not general household management) and is
-- named as a follow-up in docs/DECISIONS.md ADR-032.

-- ============================================================================
-- Part 1 — relax attribution-only FKs so they can be nulled instead of
-- blocking (or, worse, cascading and destroying shared data).
-- ============================================================================
--
-- Every one of these columns is attribution/provenance metadata, never an
-- authorization gate (RLS conditions only on is_household_member/
-- is_household_admin(household_id) — confirmed by re-reading every policy
-- in migrations 001/002 before writing this file, per this milestone's
-- explicit instruction not to introduce unsafe cascading behavior without
-- reviewing every foreign key first). None of them currently has an
-- ON DELETE clause, which defaults to NO ACTION — deleting a referenced
-- auth.users row would otherwise fail outright the moment that user has
-- created so much as one household, invitation, transaction, recurring
-- template, or savings goal.

ALTER TABLE households ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE households DROP CONSTRAINT households_created_by_fkey;
ALTER TABLE households ADD CONSTRAINT households_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE invitations ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE invitations DROP CONSTRAINT invitations_invited_by_fkey;
ALTER TABLE invitations ADD CONSTRAINT invitations_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Already nullable — only the FK's ON DELETE behavior changes, per the
-- confirmed decision to convert a departing member's personal accounts to
-- household-owned rather than deleting them.
ALTER TABLE accounts DROP CONSTRAINT accounts_owner_id_fkey;
ALTER TABLE accounts ADD CONSTRAINT accounts_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Already nullable.
ALTER TABLE transactions DROP CONSTRAINT transactions_payer_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_payer_id_fkey
  FOREIGN KEY (payer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE transactions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE transactions DROP CONSTRAINT transactions_created_by_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE recurring_transactions ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE recurring_transactions DROP CONSTRAINT recurring_transactions_created_by_fkey;
ALTER TABLE recurring_transactions ADD CONSTRAINT recurring_transactions_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE savings_goals ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE savings_goals DROP CONSTRAINT savings_goals_created_by_fkey;
ALTER TABLE savings_goals ADD CONSTRAINT savings_goals_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================================
-- Part 2 — widen the three UPDATE policies whose WITH CHECK reads
-- created_by IN (SELECT user_id FROM household_members ...).
-- ============================================================================
--
-- Real bug this migration would otherwise introduce, found by re-reading
-- every policy that touches created_by before writing Part 1: once a row's
-- created_by is nulled by delete_own_account() below, `NULL IN (SELECT ...)`
-- is never TRUE in SQL — every future UPDATE to that row by a remaining
-- household member would be silently rejected by the existing WITH CHECK,
-- permanently freezing any transaction/recurring template/savings goal ever
-- created by a departed member. Widened to accept created_by IS NULL,
-- exactly mirroring the payer_id IS NULL OR payer_id IN (...) pattern
-- already used two lines above it in the same policies.
--
-- Accepted, reviewed consequence (database-security-reviewer, Milestone 9):
-- created_by being nullable and NOT NULL-enforced-away-from-NULL means any
-- active household member can now UPDATE ... SET created_by = NULL on a
-- row created by another still-active member, not only a departed one —
-- before this migration that was structurally impossible (created_by was
-- NOT NULL). This stays strictly same-household: the non-NULL branch of
-- every check below is unchanged, so created_by still can never be pointed
-- at a user outside the household — D2's actual coherence guarantee is
-- intact. RLS WITH CHECK cannot see the row's prior value to restrict this
-- to "only if it was already NULL" (that would need a trigger, not a
-- policy), and it mirrors an already-shipped precedent (payer_id IS NULL OR
-- payer_id IN (...), permitted since migration 002). Accepted rather than
-- engineered around; pinned by a dedicated rls_tests.sql test so any future
-- accidental change to it is caught.

DROP POLICY "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
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
      created_by IS NULL
      OR created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

DROP POLICY "recurring_update" ON recurring_transactions;
CREATE POLICY "recurring_update" ON recurring_transactions
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND account_id IN (SELECT id FROM accounts WHERE accounts.household_id = recurring_transactions.household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = recurring_transactions.household_id OR categories.household_id IS NULL)
    )
    AND (
      created_by IS NULL
      OR created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = recurring_transactions.household_id)
    )
  );

DROP POLICY "savings_goals_update" ON savings_goals;
CREATE POLICY "savings_goals_update" ON savings_goals
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND (
      account_id IS NULL
      OR account_id IN (SELECT id FROM accounts WHERE accounts.household_id = savings_goals.household_id)
    )
    AND (
      created_by IS NULL
      OR created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = savings_goals.household_id)
    )
  );

-- ============================================================================
-- Part 3 — delete_own_account()
-- ============================================================================
--
-- Zero parameters, deliberately — the only user this function can ever
-- affect is auth.uid() itself, never a caller-supplied id. This is what
-- makes cross-account/cross-household deletion structurally impossible
-- rather than merely policy-forbidden.
--
-- Must be SECURITY DEFINER: deleting a household row has no DELETE policy
-- at all (there never has been one — see households_update's comment in
-- DATABASE_SCHEMA.md), and promoting a member to admin has no UPDATE policy
-- at all (ADR-022, deliberate). Both are therefore only reachable through an
-- audited definer function, exactly as ADR-022 anticipates. Being SECURITY
-- DEFINER, every statement in this function runs with the owning role's
-- privileges and bypasses RLS entirely for its own writes — every WHERE
-- clause below is therefore scoped explicitly by v_user_id/v_household_id,
-- both derived server-side, never from client input, since RLS provides no
-- safety net inside this function's body.
--
-- Deleting the underlying auth.users row (not just signing the user out, not
-- just anonymizing) is required for the flow to be a real deletion rather
-- than a soft-delete a support engineer could quietly reverse (T8,
-- TRUST_AND_PRIVACY.md: "deletion is real and complete"). No service-role
-- key is used or exposed anywhere — DELETE FROM auth.users runs inside this
-- SECURITY DEFINER function under the function OWNER's privileges (the
-- migration-running role), which is the standard, documented way to offer
-- self-service account deletion from a client that only ever holds the anon
-- key (ADR-003: no server layer, no service-role key in client code).
--
-- NEEDS LIVE VERIFICATION (cannot be proven in a sandbox without Docker/
-- Supabase — database-security-reviewer, Milestone 9; flagged honestly
-- rather than assumed, matching this project's standing rule for every
-- schema-touching milestone where the DB gate could not actually run):
-- that the function-owning role genuinely has DELETE on auth.users (not
-- just enough privilege to attach a trigger to it, which migration 001's
-- handle_new_user already proves — a different privilege), and that every
-- GoTrue auxiliary table (auth.sessions, auth.refresh_tokens,
-- auth.identities, ...) cascades cleanly. Also worth a real check before
-- receipt-photo attachment (POST-MVP) makes it relevant: `avatar_url`/
-- `receipt_url` are unused TEXT columns today (grep confirms no
-- supabase.storage.* call exists anywhere in this app yet), so no user can
-- currently own a storage.objects row — but if a future milestone adds
-- Storage uploads before storage.objects' owner FK behavior is confirmed,
-- a user who has uploaded something could fail this DELETE with an FK
-- violation this migration does not account for.
--
-- KNOWN, ACCEPTED RESIDUAL RACE (documented rather than engineered away, on
-- the same basis as D5 in the M6 planning history): if a household's sole
-- remaining member calls this function at the exact same instant someone
-- else accepts a pending invitation to that same household, accept_invitation
-- has no lock on the households row itself (only on the invitations row it
-- consumes) and does not take this function's advisory lock either, so the
-- newly-inserted household_members row is not covered by it and can be
-- cascade-deleted along with the household a moment later. The outcome is
-- bounded and non-destructive to the new joiner's own account (only their
-- membership row vanishes, and their invitation shows accepted against a
-- household that no longer exists) — not a security hole, just a narrow,
-- confusing edge case. Closing it fully would mean adding a lock to
-- accept_invitation, an already extensively hardened and tested function
-- (ADR-010, Group 5) whose ten conditions are individually audited;
-- broadening that surface is out of scope for an account-deletion
-- milestone. Named here, not silently accepted.
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

  -- Which household (if any) this user belongs to. Safe to read without a
  -- lock: household_id never changes on an existing membership row (only
  -- role does, or the row disappears), and only THIS user's own deletion
  -- path ever removes their own row — no concurrent action by another user
  -- can make this specific read stale or wrong.
  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id;

  IF FOUND THEN
    -- Serialize every call that touches this household's membership,
    -- keyed on household_id — a different advisory-lock namespace (72702)
    -- than create_household()/accept_invitation()'s 72701, which
    -- serializes per-USER membership *creation*, a different resource.
    -- This single lock target is what actually prevents two members of the
    -- same household calling this function at the same moment from
    -- deadlocking on each other's row lock — an earlier version of this
    -- function took two separate SELECT ... FOR UPDATE locks (the caller's
    -- own row, then every row in the household) and could deadlock for
    -- real: two concurrent callers each already holding their own row
    -- locked, each then blocking on the other's. A single advisory lock
    -- has no such circular-wait shape (database-security-reviewer finding,
    -- Milestone 9). Released automatically at transaction end.
    PERFORM pg_advisory_xact_lock(72702, hashtext(v_household_id::text));

    -- Every decision below reads FRESH state taken after the lock is held,
    -- never a value read beforehand — a concurrent call for another member
    -- of this same household may have changed this user's own role (e.g.
    -- promoted them) or the membership count while this call was waiting
    -- for the lock. role is intentionally re-read here even though nothing
    -- above already read it.
    SELECT role INTO v_role
    FROM household_members
    WHERE household_id = v_household_id AND user_id = v_user_id;

    SELECT COUNT(*) INTO v_other_member_count
    FROM household_members
    WHERE household_id = v_household_id AND user_id <> v_user_id;

    IF v_other_member_count = 0 THEN
      -- Sole member (decision 2): the household becomes permanently
      -- unreachable the moment this user is gone. Delete it outright —
      -- household_id ON DELETE CASCADE (migrations 001/002) removes every
      -- account/category/category_rule/transaction/recurring_transaction/
      -- budget/budget_allocation/savings_goal/invitation/membership row
      -- that belonged to it, in this same statement.
      DELETE FROM households WHERE id = v_household_id;
      v_household_deleted := TRUE;
    ELSE
      IF v_role = 'admin' THEN
        -- Decision 1: auto-promote the longest-tenured remaining member.
        SELECT user_id INTO v_new_admin_id
        FROM household_members
        WHERE household_id = v_household_id AND user_id <> v_user_id
        ORDER BY joined_at ASC
        LIMIT 1;

        UPDATE household_members
        SET role = 'admin'
        WHERE household_id = v_household_id AND user_id = v_new_admin_id;
      END IF;

      -- Decision 3: the household continues for the remaining member(s).
      -- Every shared/financial row is preserved — it belongs to
      -- household_id, not to this user — but every attribution-only FK
      -- pointing at this user must be nulled before their auth.users row
      -- goes away. Personal accounts convert to household-owned rather
      -- than being deleted, so balances and historical budget totals for
      -- the household stay correct.
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

  -- Cascades to profiles (ON DELETE CASCADE, migration 001) and, if the
  -- household still exists, to this user's own now-orphaned
  -- household_members row (ON DELETE CASCADE, migration 001) — already
  -- handled above for the sole-member case via the household delete itself.
  -- WHERE id = v_user_id matching zero rows (a stale-but-cryptographically-
  -- valid JWT calling this a second time after the first call already
  -- deleted the row) is a harmless no-op, which is what makes this function
  -- naturally idempotent with no special-casing.
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
