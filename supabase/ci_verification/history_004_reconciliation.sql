-- Migration history reconciliation: backfill supabase_migrations.schema_migrations
-- so local migrations 001-005 are recognized as applied, WITHOUT changing any
-- schema object. Generated from the exact local file contents in this repo at
-- HEAD 840b214c3dcbd3648bcdf6b3c31dd3a328e68695. Read-only proof (Phase 1) showed:
--   - The 4 existing rows' `name` column already records
--     001_initial_schema/002_financial_schema/
--     003_recurring_generation_and_goal_completion/004_account_deletion — the CLI's
--     OWN metadata, not inference — and their `statements` content matches the
--     corresponding local files verbatim (header comments, function bodies).
--   - Migration 005 has no row at all yet (it was applied directly via psql, not
--     `supabase db push`, in migration-005-preview-validation.yml).
--
-- This INSERTs 5 new rows for version 001-005 (matching local filename version
-- prefixes exactly, the form `supabase migration list` already displays under its
-- "Local" column) and deliberately LEAVES THE 4 EXISTING TIMESTAMP ROWS UNTOUCHED.
-- Both sets can coexist: `supabase db push`/`migration list` compare LOCAL files by
-- version against WHATEVER rows exist remotely: a remote row with no local
-- counterpart (the 4 old ones, after this) is simply listed as remote-only and
-- never touched; a local file whose version now has a matching remote row (001-005,
-- after this) is treated as already applied and skipped by `db push`. Deleting or
-- renaming the old rows would lose real deployment history for no benefit.
--
-- `statements` is a single-element array (one full-file string), matching the exact
-- pattern already used by all 4 existing rows (n_statements=1 each). `idempotency_key`
-- and `rollback` are left NULL, matching the existing rows (NULL is UNIQUE-safe --
-- standard SQL never treats two NULLs as equal). `created_by` is set to a distinct,
-- honest label rather than reusing the human user's email from the original 4 rows,
-- since these rows were not created via their authenticated `supabase db push`.
--
-- Pure INSERT into supabase_migrations.schema_migrations only. No statement here
-- touches the public schema or any application table/function/policy.

BEGIN;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (
  '001',
  ARRAY[$mig001body$-- OurMoney — Migration 001: Initial schema (MVP-1 — Foundation & Auth)
--
-- Creates profiles, households, household_members, invitations, the two RLS
-- helper functions, the create_household and accept_invitation RPCs, and all
-- RLS policies for these four tables.
--
-- Financial tables (accounts, categories, category_rules, transactions,
-- recurring_transactions, budgets, budget_allocations, savings_goals) are
-- NOT created here — they land in migration 002 during MVP-2.
--
-- Ordering is deliberate (see docs/PHASE_1_PLAN.md#22-migration-001):
-- trigger functions before the tables that use them, tables before the RLS
-- helpers that query them, helpers before the policies that call them.

-- ============================================================================
-- 1. update_updated_at() — generic trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. handle_new_user() — auto-create a profile row on sign-up
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger functions are invoked by the trigger, never called directly.
-- PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION — revoke it.
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. profiles
-- ============================================================================

CREATE TABLE profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL,
  avatar_url    TEXT,
  locale        TEXT        NOT NULL DEFAULT 'he',
  timezone      TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 4. households
-- ============================================================================

CREATE TABLE households (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'ILS',
  created_by  UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 5. household_members
-- ============================================================================

-- Supports N members by design. UX is optimized for two partners; the schema
-- assumes nothing of the kind. See ADR-006.
CREATE TABLE household_members (
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('admin', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);

-- RLS inner lookup — most critical index in the schema.
CREATE INDEX idx_household_members_user ON household_members(user_id, household_id);

-- ============================================================================
-- 6. invitations
-- ============================================================================

CREATE TABLE invitations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  invited_by    UUID        NOT NULL REFERENCES auth.users(id),
  email         TEXT,
  token         TEXT        NOT NULL UNIQUE
                            DEFAULT encode(gen_random_bytes(32), 'hex'),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','accepted','expired','cancelled')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================================
-- 7. is_household_member() — RLS helper
-- ============================================================================

CREATE OR REPLACE FUNCTION is_household_member(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION is_household_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_household_member(UUID) TO authenticated;

-- ============================================================================
-- 8. is_household_admin() — RLS helper
-- ============================================================================

CREATE OR REPLACE FUNCTION is_household_admin(hid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = hid AND user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION is_household_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_household_admin(UUID) TO authenticated;

-- ============================================================================
-- 9. Enable RLS on all four tables
-- ============================================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE households        ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations       ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 10. RLS policies
-- ============================================================================

-- profiles: anyone authenticated can read (needed to show partner name);
-- users can only update their own row.
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- households: members can read their own household.
CREATE POLICY "households_select" ON households
  FOR SELECT TO authenticated USING (is_household_member(id));

-- NO INSERT POLICY. Households are created only by create_household().
-- A direct client INSERT would succeed here but the follow-up membership
-- INSERT would fail (household_members has no INSERT policy), leaving an
-- orphaned household that its own creator cannot see — households_select
-- requires membership. Denying the insert outright is the only way to make
-- that unreachable state actually unreachable.

CREATE POLICY "households_update" ON households
  FOR UPDATE TO authenticated USING (is_household_admin(id));

-- household_members: members can see who else is in their household.
CREATE POLICY "household_members_select" ON household_members
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- NO INSERT POLICY. NO UPDATE POLICY. This is deliberate — see ADR-022.
-- Membership is created exclusively by create_household() and
-- accept_invitation(), both SECURITY DEFINER. Roles are never changed by
-- clients.

-- Admins can remove members; members can remove themselves.
CREATE POLICY "household_members_delete" ON household_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR is_household_admin(household_id)
  );

-- invitations: household members can see invitations for their household.
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- Reading a specific invitation by token (for acceptance) is handled by the
-- accept_invitation() SECURITY DEFINER function, never by a permissive
-- policy here.

-- Only admins can create invitations.
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_household_admin(household_id));

-- Admins can cancel invitations.
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (is_household_admin(household_id));

-- ============================================================================
-- 10b. Table grants for the `authenticated` role
-- ============================================================================
--
-- RLS policies alone are not sufficient: PostgREST/the Supabase client connect
-- as `authenticated` or `anon`, and Postgres checks the standard GRANT system
-- *before* RLS is ever evaluated. Newer Supabase projects are not
-- auto-exposed to the Data API by default (config.toml's
-- `auto_expose_new_tables` is off), so every table needs an explicit GRANT
-- matching exactly what its RLS policies already permit — nothing broader.
-- `anon` gets no grants on any of these tables; every policy above requires
-- `authenticated`.
--
-- The REVOKE ALL below is not redundant with the above (database-security-
-- reviewer HIGH finding, confirmed against a live `supabase db reset`):
-- Supabase's local Postgres instance grants `anon`/`authenticated` TABLE-WIDE
-- privileges — TRUNCATE, REFERENCES, TRIGGER — on every newly created public
-- table by default, via a mechanism independent of `auto_expose_new_tables`
-- (that setting only governs the Data-API-relevant SELECT/INSERT/UPDATE/
-- DELETE privileges). TRUNCATE and REFERENCES are NOT subject to RLS at all,
-- so without an explicit REVOKE this defeats fail-closed/least-privilege
-- even though PostgREST never exposes a TRUNCATE endpoint. REVOKE ALL FROM
-- PUBLIC alone is not sufficient either — these privileges are granted
-- directly to the named roles, not via the PUBLIC pseudo-role — so `anon`
-- and `authenticated` must both be named explicitly.

REVOKE ALL ON profiles           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON households         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON household_members  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON invitations        FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, UPDATE ON households TO authenticated;
GRANT SELECT, DELETE ON household_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON invitations TO authenticated;

-- ============================================================================
-- 11. create_household() RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION create_household(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id      UUID := auth.uid();
  v_household_id UUID;
  v_name         TEXT := NULLIF(TRIM(p_name), '');
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF v_name IS NULL OR length(v_name) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  -- Serialize concurrent membership-creation calls for this user (ADR-020:
  -- one household per user). Without this, this function racing itself, or
  -- racing accept_invitation(), could each pass the EXISTS check below
  -- before either commits — they insert into different household_id rows,
  -- which share no constrained key to contend on, so nothing else prevents
  -- one user ending up a member of two households. Shares its lock
  -- namespace with accept_invitation() so the two functions serialize
  -- against each other too, not just against themselves. Released
  -- automatically at transaction end.
  PERFORM pg_advisory_xact_lock(72701, hashtext(v_user_id::text));

  -- MVP: one household per user (ADR-020)
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = v_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_household');
  END IF;

  INSERT INTO households (name, created_by)
  VALUES (v_name, v_user_id)
  RETURNING id INTO v_household_id;

  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_household_id, v_user_id, 'admin');

  RETURN jsonb_build_object('ok', true, 'household_id', v_household_id);
END;
$$;

REVOKE ALL ON FUNCTION create_household(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_household(TEXT) TO authenticated;

-- ============================================================================
-- 12. accept_invitation() RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION accept_invitation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp          -- (1) fixed search_path
AS $$
DECLARE
  v_invitation            invitations%ROWTYPE;
  v_user_id               UUID := auth.uid();
  v_existing_household_id UUID;
BEGIN
  -- (2) reject anonymous callers
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  -- Same lock, same namespace as create_household() — see the comment
  -- there. Without it, this function racing create_household() (or racing
  -- itself with two different tokens) could each pass the EXISTS check
  -- below before either commits, since the resulting inserts land in
  -- different household_id rows with no shared key to contend on.
  PERFORM pg_advisory_xact_lock(72701, hashtext(v_user_id::text));

  -- ADR-020 one-household-per-user, checked BEFORE the token is examined.
  -- Order matters: if this ran after validation, the caller could distinguish
  -- a valid token ('already_in_household') from an invalid one
  -- ('invalid_invitation'), which is exactly the oracle condition (9)
  -- forbids. The already-a-member case is handled inside this branch so a
  -- repeat tap still works.
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = v_user_id) THEN
    -- (6) already a member of the household this token targets: idempotent
    -- success. Any status is accepted here, including expired/cancelled —
    -- the user is already where the token would have put them, so surfacing
    -- an error would be misleading.
    SELECT hm.household_id INTO v_existing_household_id
    FROM household_members hm
    JOIN invitations i ON i.household_id = hm.household_id
    WHERE hm.user_id = v_user_id
      AND i.token = p_token
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'household_id', v_existing_household_id,
        'already_member', true
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'already_in_household');
  END IF;

  -- (3)(4)(5)(8) fetch and lock the invitation; validate token, status, expiry.
  -- FOR UPDATE prevents two concurrent callers both passing validation.
  SELECT * INTO v_invitation
  FROM invitations
  WHERE token = p_token
  FOR UPDATE;

  -- (9) generic failure — never reveal whether the token existed, had
  --     already been used, or merely expired.
  IF NOT FOUND
     OR v_invitation.status <> 'pending'
     OR v_invitation.expires_at <= NOW()
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_invitation');
  END IF;

  -- (7) atomic: both statements commit together or neither does
  INSERT INTO household_members (household_id, user_id, role)
  VALUES (v_invitation.household_id, v_user_id, 'member');

  UPDATE invitations
  SET status = 'accepted'
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'ok', true,
    'household_id', v_invitation.household_id,
    'already_member', false
  );
END;
$$;

-- (10) authenticated users only — never anon
REVOKE ALL ON FUNCTION accept_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT) TO authenticated;
$mig001body$],
  '001_initial_schema',
  'history-reconciliation-backfill',
  NULL,
  NULL
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (
  '002',
  ARRAY[$mig002body$-- OurMoney — Migration 002: Financial schema (MVP-2 — Core Financial Loop)
--
-- Creates accounts, categories, category_rules, recurring_transactions,
-- transactions, budgets, budget_allocations, savings_goals, all their RLS
-- policies and table grants, the 23-row system category seed, and the
-- save_budget_allocations() RPC.
--
-- This is a faithful transcription of docs/DATABASE_SCHEMA.md's literal
-- schema EXCEPT for the deviations below, each individually approved during
-- Milestone 6 planning (see /root/.claude/plans/federated-noodling-moore.md
-- §3 D2/D3/D6, §4, §4a) and re-confirmed by database-security-reviewer
-- against this actual SQL before commit:
--
--   D2  Cross-household FK coherence. The literal docs check only
--       budget_allocations.budget_id against its household — nothing stops
--       a member from pointing account_id/category_id/recurring_id/
--       created_by/payer_id at another household's row via the FK alone.
--       Every WITH CHECK below that references another household-owned
--       table adds an explicit "same household" (or "system row") coherence
--       clause, ANDed onto the existing is_household_member(household_id)
--       check — never replacing it. Extended during implementation, beyond
--       the plan's literal list, to two more columns of the identical shape
--       (accounts.owner_id, savings_goals.account_id, categories.parent_id)
--       found while writing this file — flagged explicitly below for
--       database-security-reviewer to confirm or reject.
--
--   D3  save_budget_allocations() RPC — true-replace semantics, atomic,
--       SECURITY INVOKER, explicit REVOKE/GRANT. See the RPC's own header.
--
--   D6  transactions/recurring_transactions get CHECK (amount_agorot <> 0)
--       — zero is never a legitimate "movement of money" (invariant I1),
--       enforced at the DB layer per explicit instruction, not client-only.
--
--   D1  recurring_transactions and savings_goals are included here
--       (schema + RLS only — no UI/hooks/engine consumes them this
--       milestone), matching DATABASE_SCHEMA.md's stated two-migration
--       design rather than deferring them to their own future migration.
--
-- Ordering: tables in FK dependency order, then indexes, then RLS (enable +
-- policies, which call migration 001's is_household_member/
-- is_household_admin — no new helper functions needed), then grants, then
-- the category seed, then the RPC.

-- ============================================================================
-- 1. accounts
-- ============================================================================

CREATE TABLE accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id          UUID        REFERENCES auth.users(id),
  name              TEXT        NOT NULL,
  type              TEXT        NOT NULL
                                CHECK (type IN (
                                  'checking','savings','credit_card',
                                  'cash','investment','other'
                                )),
  currency          TEXT        NOT NULL DEFAULT 'ILS',
  balance_agorot    BIGINT      NOT NULL DEFAULT 0,
  color             TEXT,
  icon              TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  include_in_total  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- owner_id = NULL means the account belongs to the whole household;
-- owner_id = some_user_id means it is that member's personal account.

CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 2. categories
-- ============================================================================

CREATE TABLE categories (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        REFERENCES households(id) ON DELETE CASCADE,
  name_he       TEXT        NOT NULL,
  name_en       TEXT,
  icon          TEXT        NOT NULL DEFAULT '📦',
  color         TEXT        NOT NULL DEFAULT '#6366f1',
  parent_id     UUID        REFERENCES categories(id),
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  is_income     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- household_id = NULL means a system category, visible to every household.
-- parent_id is unused in MVP (sub-categories are POST-MVP) but the column
-- exists per the documented schema, so its RLS coherence is closed below
-- (D2 extension) rather than left to whatever a future writer assumes.

-- ============================================================================
-- 3. category_rules
-- ============================================================================

CREATE TABLE category_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id       UUID        NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  field             TEXT        NOT NULL CHECK (field IN ('description','merchant_name')),
  operator          TEXT        NOT NULL CHECK (operator IN ('contains','equals','starts_with')),
  value             TEXT        NOT NULL,
  is_case_sensitive BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. recurring_transactions (D1 — schema only, no MVP-2 UI/engine)
-- ============================================================================

CREATE TABLE recurring_transactions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id        UUID        NOT NULL REFERENCES accounts(id),
  category_id       UUID        REFERENCES categories(id),
  amount_agorot     BIGINT      NOT NULL CHECK (amount_agorot <> 0), -- D6
  currency          TEXT        NOT NULL DEFAULT 'ILS',
  description       TEXT        NOT NULL,
  is_shared         BOOLEAN     NOT NULL DEFAULT TRUE,
  frequency         TEXT        NOT NULL
                                CHECK (frequency IN (
                                  'daily','weekly','biweekly',
                                  'monthly','quarterly','yearly'
                                )),
  day_of_month      INTEGER     CHECK (day_of_month BETWEEN 1 AND 31),
  next_due_date     DATE        NOT NULL,
  last_generated_at TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by        UUID        NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. transactions
-- ============================================================================

CREATE TABLE transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id       UUID        NOT NULL REFERENCES accounts(id),
  category_id      UUID        REFERENCES categories(id),
  recurring_id     UUID        REFERENCES recurring_transactions(id),
  amount_agorot    BIGINT      NOT NULL CHECK (amount_agorot <> 0), -- D6
  currency         TEXT        NOT NULL DEFAULT 'ILS',
  description      TEXT        NOT NULL,
  merchant_name    TEXT,
  -- The date money moves for THIS ROW. Not the purchase date, not the
  -- statement date. One row = one movement (invariant I1/I3).
  txn_date         DATE        NOT NULL,
  -- BUDGET ATTRIBUTION ONLY. Not a visibility flag — every household member
  -- can read every row in MVP regardless of this value. See §6a of the M6
  -- plan for the full, tested visibility matrix.
  is_shared        BOOLEAN     NOT NULL DEFAULT TRUE,
  payer_id         UUID        REFERENCES auth.users(id),
  note             TEXT,
  receipt_url      TEXT,
  is_excluded      BOOLEAN     NOT NULL DEFAULT FALSE,
  source           TEXT        NOT NULL DEFAULT 'manual'
                               CHECK (source IN ('manual','csv_import','recurring')),
  created_by       UUID        NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No UNIQUE constraint on business fields (invariant I4) — deduplication of
-- near-identical rows (e.g. installments, re-entry) is scored application
-- logic, deliberately not a DB constraint.

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 6. budgets
-- ============================================================================

CREATE TABLE budgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, period_start)
);

-- ============================================================================
-- 7. budget_allocations
-- ============================================================================

CREATE TABLE budget_allocations (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_id       UUID    NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id     UUID    NOT NULL REFERENCES categories(id),
  amount_agorot   BIGINT  NOT NULL CHECK (amount_agorot > 0),
  UNIQUE (budget_id, category_id)
);
-- household_id is denormalized here deliberately, matching every other
-- financial table, so RLS stays a single is_household_member(household_id)
-- call rather than a subquery through budgets.

-- ============================================================================
-- 8. savings_goals (D1 — schema only, no MVP-2 UI)
-- ============================================================================

CREATE TABLE savings_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id      UUID        REFERENCES accounts(id),
  name            TEXT        NOT NULL,
  target_agorot   BIGINT      NOT NULL CHECK (target_agorot > 0),
  current_agorot  BIGINT      NOT NULL DEFAULT 0,
  target_date     DATE,
  icon            TEXT,
  color           TEXT,
  is_completed    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by      UUID        NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 9. Indexes
-- ============================================================================

CREATE INDEX idx_transactions_household_date   ON transactions(household_id, txn_date DESC);
CREATE INDEX idx_transactions_account          ON transactions(account_id);
CREATE INDEX idx_transactions_category         ON transactions(category_id);
CREATE INDEX idx_transactions_household_shared ON transactions(household_id, is_shared);
CREATE INDEX idx_budgets_household_period      ON budgets(household_id, period_start);
CREATE INDEX idx_budget_allocations_budget     ON budget_allocations(budget_id);
CREATE INDEX idx_budget_allocations_household  ON budget_allocations(household_id);
CREATE INDEX idx_category_rules_household      ON category_rules(household_id, is_active);
CREATE INDEX idx_recurring_due_date            ON recurring_transactions(next_due_date)
  WHERE is_active = TRUE;
CREATE INDEX idx_categories_household          ON categories(household_id);

-- ============================================================================
-- 10. Enable RLS on all eight tables
-- ============================================================================

ALTER TABLE accounts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_allocations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals           ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. RLS policies
-- ============================================================================

-- ---- accounts ----
-- D2 EXTENSION (beyond the plan's literal list — flagged for
-- database-security-reviewer): owner_id is a nullable FK to auth.users
-- representing "this member's personal account," structurally identical to
-- transactions.payer_id. Without a coherence check, a household member
-- could attribute an account's ownership to a user outside the household.
CREATE POLICY "accounts_select" ON accounts
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND (
      owner_id IS NULL
      OR owner_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = accounts.household_id)
    )
  );

CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND (
      owner_id IS NULL
      OR owner_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = accounts.household_id)
    )
  );

CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE TO authenticated USING (is_household_admin(household_id));

-- ---- categories ----
-- D2 EXTENSION (beyond the plan's literal list — flagged for
-- database-security-reviewer): parent_id is unused in MVP-2 (sub-categories
-- are POST-MVP) but the column exists now; without a coherence check a
-- household member could point it at another household's category.
CREATE POLICY "categories_select" ON categories
  FOR SELECT TO authenticated
  USING (
    household_id IS NULL
    OR is_household_member(household_id)
  );

CREATE POLICY "categories_insert" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id IS NOT NULL
    AND is_household_member(household_id)
    AND is_system = FALSE
    AND (
      parent_id IS NULL
      OR parent_id IN (SELECT id FROM categories c2 WHERE c2.household_id = categories.household_id OR c2.household_id IS NULL)
    )
  );

CREATE POLICY "categories_update" ON categories
  FOR UPDATE TO authenticated
  USING (
    household_id IS NOT NULL
    AND is_household_member(household_id)
    AND is_system = FALSE
  )
  WITH CHECK (
    household_id IS NOT NULL
    AND is_household_member(household_id)
    AND is_system = FALSE
    AND (
      parent_id IS NULL
      OR parent_id IN (SELECT id FROM categories c2 WHERE c2.household_id = categories.household_id OR c2.household_id IS NULL)
    )
  );

CREATE POLICY "categories_delete" ON categories
  FOR DELETE TO authenticated
  USING (
    household_id IS NOT NULL
    AND is_household_admin(household_id)
    AND is_system = FALSE
  );

-- ---- category_rules ----
-- D2: category_id coherence — a rule must target a category belonging to
-- the same household, or a system category (household_id IS NULL). Omitting
-- the system-category leg would break rules targeting any of the 23 seeded
-- categories, the primary MVP-2 categorization scheme.
CREATE POLICY "category_rules_select" ON category_rules
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "category_rules_insert" ON category_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND category_id IN (
      SELECT id FROM categories WHERE categories.household_id = category_rules.household_id OR categories.household_id IS NULL
    )
  );

CREATE POLICY "category_rules_update" ON category_rules
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND category_id IN (
      SELECT id FROM categories WHERE categories.household_id = category_rules.household_id OR categories.household_id IS NULL
    )
  );

CREATE POLICY "category_rules_delete" ON category_rules
  FOR DELETE TO authenticated USING (is_household_member(household_id));

-- ---- recurring_transactions ----
-- D1 + D2: same account_id/category_id coherence legs as transactions below,
-- plus a created_by coherence check (database-security-reviewer HIGH
-- finding: created_by is NOT NULL REFERENCES auth.users with no DEFAULT,
-- structurally identical to transactions.created_by, and was left
-- unconstrained in the original draft of this file — any household member
-- could look up an arbitrary real user's id via the world-readable
-- `profiles` table and falsely attribute a recurring template's creation to
-- them, including someone outside the household. Same INSERT-vs-UPDATE
-- asymmetry as transactions, same reasoning: INSERT pins the creator to the
-- caller; UPDATE only requires the value resolve to a current household
-- member, so co-editing by any member stays possible).
CREATE POLICY "recurring_select" ON recurring_transactions
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "recurring_insert" ON recurring_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND account_id IN (SELECT id FROM accounts WHERE accounts.household_id = recurring_transactions.household_id)
    AND (
      category_id IS NULL
      OR category_id IN (SELECT id FROM categories WHERE categories.household_id = recurring_transactions.household_id OR categories.household_id IS NULL)
    )
    AND created_by = auth.uid()
  );

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
    AND created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = recurring_transactions.household_id)
  );

CREATE POLICY "recurring_delete" ON recurring_transactions
  FOR DELETE TO authenticated USING (is_household_member(household_id));

-- ---- transactions ----
-- D2 (the largest single change in this migration — see the M6 plan §3 D2
-- for the full rationale): account_id/category_id/recurring_id coherence,
-- created_by attribution, payer_id household-membership coherence.
--
-- created_by is checked differently on INSERT than on UPDATE, deliberately:
--   - INSERT: created_by must equal the inserting user (auth.uid()) — you
--     cannot attribute a new row's creation to someone else.
--   - UPDATE: created_by must still resolve to *some* member of the same
--     household, but is NOT pinned to auth.uid() — the already-approved
--     financial visibility matrix (M6 plan §6a) requires that ANY household
--     member can edit ANY transaction, including one created by their
--     partner. Requiring NEW.created_by = auth.uid() on UPDATE would silently
--     break that (a User B edit of User A's unchanged created_by would fail
--     WITH CHECK), so UPDATE gets the same household-coherence treatment as
--     payer_id instead — closing the false-cross-household-attribution gap
--     without blocking legitimate co-editing. Flagged explicitly for
--     database-security-reviewer to confirm this reading.
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT TO authenticated
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
    AND created_by = auth.uid()
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

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
    AND created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

-- Soft delete only: transactions use is_excluded. Hard delete requires admin.
CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE TO authenticated USING (is_household_admin(household_id));

-- ---- budgets ----
CREATE POLICY "budgets_select" ON budgets
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "budgets_insert" ON budgets
  FOR INSERT TO authenticated WITH CHECK (is_household_member(household_id));

CREATE POLICY "budgets_update" ON budgets
  FOR UPDATE TO authenticated USING (is_household_member(household_id));

CREATE POLICY "budgets_delete" ON budgets
  FOR DELETE TO authenticated USING (is_household_admin(household_id));

-- ---- budget_allocations ----
-- D2: the documented policy only coheres budget_id; category_id was missing
-- entirely (a household member could allocate budget to another
-- household's category). Added here, including the system-category leg.
CREATE POLICY "budget_allocations_select" ON budget_allocations
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "budget_allocations_insert" ON budget_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND budget_id IN (SELECT id FROM budgets WHERE budgets.household_id = budget_allocations.household_id)
    AND category_id IN (
      SELECT id FROM categories WHERE categories.household_id = budget_allocations.household_id OR categories.household_id IS NULL
    )
  );

CREATE POLICY "budget_allocations_update" ON budget_allocations
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND budget_id IN (SELECT id FROM budgets WHERE budgets.household_id = budget_allocations.household_id)
    AND category_id IN (
      SELECT id FROM categories WHERE categories.household_id = budget_allocations.household_id OR categories.household_id IS NULL
    )
  );

CREATE POLICY "budget_allocations_delete" ON budget_allocations
  FOR DELETE TO authenticated USING (is_household_member(household_id));

-- ---- savings_goals ----
-- D1 + D2 EXTENSION (beyond the plan's literal list — flagged for and
-- confirmed by database-security-reviewer): account_id is a nullable FK to
-- accounts, structurally identical to every other cross-table reference D2
-- closes. created_by coherence added for the same reason as
-- recurring_transactions above (database-security-reviewer HIGH finding —
-- NOT NULL REFERENCES auth.users with no DEFAULT and no constraint in the
-- original draft).
CREATE POLICY "savings_goals_select" ON savings_goals
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "savings_goals_insert" ON savings_goals
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND (
      account_id IS NULL
      OR account_id IN (SELECT id FROM accounts WHERE accounts.household_id = savings_goals.household_id)
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "savings_goals_update" ON savings_goals
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND (
      account_id IS NULL
      OR account_id IN (SELECT id FROM accounts WHERE accounts.household_id = savings_goals.household_id)
    )
    AND created_by IN (SELECT user_id FROM household_members WHERE household_members.household_id = savings_goals.household_id)
  );

CREATE POLICY "savings_goals_delete" ON savings_goals
  FOR DELETE TO authenticated USING (is_household_member(household_id));

-- ============================================================================
-- 12. Table grants for the `authenticated` role
-- ============================================================================
-- Same rationale as migration 001 §10b: PostgREST checks GRANTs before RLS.
-- The documented schema's RLS section never states these explicitly — a real
-- gap independent of RLS correctness (database-security-reviewer finding).
-- Each table's grant matches exactly what its policies above permit.
--
-- REVOKE ALL below closes a real, confirmed gap (database-security-reviewer
-- MEDIUM finding, reported against a live `supabase db reset`): Supabase's
-- local Postgres instance grants `anon`/`authenticated` TABLE-WIDE
-- privileges — TRUNCATE, REFERENCES, TRIGGER — on every newly created public
-- table by default, independent of `auto_expose_new_tables` (which only
-- governs the Data-API-relevant SELECT/INSERT/UPDATE/DELETE privileges).
-- TRUNCATE and REFERENCES are NOT subject to RLS, so leaving them ungranted-
-- but-unrevoked defeats fail-closed/least-privilege even though PostgREST
-- never exposes a TRUNCATE endpoint. REVOKE ALL FROM PUBLIC alone would not
-- be sufficient — these privileges are granted directly to the named roles,
-- not via the PUBLIC pseudo-role — so `anon` and `authenticated` are both
-- named explicitly. `service_role` is deliberately untouched: it is not
-- named in either REVOKE or GRANT anywhere in this file, and REVOKE ... FROM
-- PUBLIC/anon/authenticated cannot affect privileges granted directly to a
-- different role — service_role's access comes from platform-level role
-- attributes (RLS bypass), not from these app-schema table grants.

REVOKE ALL ON accounts               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON categories             FROM PUBLIC, anon, authenticated;
REVOKE ALL ON category_rules         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON recurring_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON transactions           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON budgets                FROM PUBLIC, anon, authenticated;
REVOKE ALL ON budget_allocations     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON savings_goals          FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON accounts               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON category_rules          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON recurring_transactions  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON transactions             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budgets                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON budget_allocations      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON savings_goals            TO authenticated;

-- ============================================================================
-- 13. System category seed (23 rows) — permanent product data, not a test
-- fixture, so it lives in the migration itself. Idempotent via WHERE NOT
-- EXISTS so a repeated `db push` does not duplicate rows (no natural unique
-- key exists on name_he alone across re-runs otherwise).
-- ============================================================================

INSERT INTO categories (name_he, name_en, icon, is_income, is_system, sort_order)
SELECT v.name_he, v.name_en, v.icon, v.is_income, TRUE, v.sort_order
FROM (VALUES
  ('מזון וסופרמרקט',    'Food & Groceries',     '🛒', FALSE, 1),
  ('מסעדות ובתי קפה',    'Restaurants & Cafes',  '☕', FALSE, 2),
  ('דיור ושכירות',       'Housing & Rent',       '🏠', FALSE, 3),
  ('תחבורה',             'Transportation',       '🚗', FALSE, 4),
  ('בריאות ורפואה',      'Health & Medical',     '💊', FALSE, 5),
  ('חינוך',              'Education',            '📚', FALSE, 6),
  ('בידור ופנאי',        'Entertainment',        '🎬', FALSE, 7),
  ('קניות',              'Shopping',             '🛍️', FALSE, 8),
  ('ספורט וכושר',        'Sports & Fitness',     '🏋️', FALSE, 9),
  ('תקשורת',             'Communications',       '📱', FALSE, 10),
  ('ביטוח',              'Insurance',            '🛡️', FALSE, 11),
  ('חיות מחמד',          'Pets',                 '🐾', FALSE, 12),
  ('חופשה ונסיעות',      'Vacation & Travel',    '✈️', FALSE, 13),
  ('מתנות ותרומות',      'Gifts & Donations',    '🎁', FALSE, 14),
  ('שירותים',            'Utilities',            '⚡', FALSE, 15),
  ('טיפול אישי',         'Personal Care',        '💆', FALSE, 16),
  ('ילדים',              'Children',             '👶', FALSE, 17),
  ('אחר',                'Other',                '📦', FALSE, 18),
  ('משכורת',             'Salary',               '💼', TRUE,  19),
  ('בונוס',              'Bonus',                '🎉', TRUE,  20),
  ('פרילנס',             'Freelance',            '💻', TRUE,  21),
  ('השקעות',             'Investments',          '📈', TRUE,  22),
  ('אחר - הכנסה',        'Other Income',         '💰', TRUE,  23)
) AS v(name_he, name_en, icon, is_income, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE categories.name_he = v.name_he AND categories.is_system = TRUE
);

-- ============================================================================
-- 14. save_budget_allocations() RPC (D3)
-- ============================================================================
-- Atomic "save this month's budget": inserts/updates the budgets row and
-- every submitted allocation, and DELETEs any allocation that existed for
-- this household/month but was omitted from the new submitted set (true
-- replace, not upsert-only) — all inside one function body, so it commits
-- together or not at all.
--
-- SECURITY INVOKER, not DEFINER: every write below still runs as the
-- calling user and is still subject to the RLS policies above (including
-- the D2 budget_allocations.category_id coherence leg) — no privilege
-- escalation, no RLS bypass. The household is resolved from the caller's
-- own ADR-020 single membership; there is deliberately no p_household_id
-- parameter, so a caller cannot even attempt to target another household.
--
-- amount_agorot is validated as a plain integer string before casting —
-- never rounded through ::numeric::bigint, per CLAUDE.md's absolute
-- no-float-money rule.
CREATE OR REPLACE FUNCTION save_budget_allocations(p_period_start DATE, p_allocations JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID := auth.uid();
  v_household_id       UUID;
  v_period_end         DATE;
  v_budget_id          UUID;
  v_alloc              JSONB;
  v_category_id        UUID;
  v_amount_text        TEXT;
  v_amount             BIGINT;
  v_kept_category_ids  UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF p_period_start IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_period');
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_allocations');
  END IF;

  SELECT household_id INTO v_household_id
  FROM household_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_household_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_household');
  END IF;

  v_period_end := (date_trunc('month', p_period_start) + INTERVAL '1 month - 1 day')::date;

  INSERT INTO budgets (household_id, period_start, period_end)
  VALUES (v_household_id, p_period_start, v_period_end)
  ON CONFLICT (household_id, period_start)
  DO UPDATE SET period_end = EXCLUDED.period_end
  RETURNING id INTO v_budget_id;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    BEGIN
      v_category_id := (v_alloc->>'categoryId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_allocation');
    END;

    v_amount_text := v_alloc->>'amountAgorot';
    -- Strict integer-string check — rejects floats, NaN, Infinity, and
    -- anything that would otherwise silently truncate through a numeric cast.
    IF v_category_id IS NULL OR v_amount_text IS NULL OR v_amount_text !~ '^[0-9]+$' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_allocation');
    END IF;
    -- A digit string that passes the regex can still overflow bigint (e.g.
    -- 30 nines) — caught explicitly so it returns the same clean error
    -- shape instead of an unhandled numeric_value_out_of_range exception
    -- (database-security-reviewer finding).
    BEGIN
      v_amount := v_amount_text::bigint;
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_allocation');
    END;

    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_allocation');
    END IF;

    INSERT INTO budget_allocations (household_id, budget_id, category_id, amount_agorot)
    VALUES (v_household_id, v_budget_id, v_category_id, v_amount)
    ON CONFLICT (budget_id, category_id)
    DO UPDATE SET amount_agorot = EXCLUDED.amount_agorot;

    v_kept_category_ids := array_append(v_kept_category_ids, v_category_id);
  END LOOP;

  -- True replace: remove any allocation that existed for this budget but
  -- was not present in the newly submitted set (empty payload => clears the
  -- whole month, which is the correct "select no categories" behavior).
  DELETE FROM budget_allocations
  WHERE budget_id = v_budget_id
    AND NOT (category_id = ANY (v_kept_category_ids));

  RETURN jsonb_build_object('ok', true, 'budget_id', v_budget_id);
END;
$$;

REVOKE ALL ON FUNCTION save_budget_allocations(DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION save_budget_allocations(DATE, JSONB) TO authenticated;

-- ============================================================================
-- 15. Realtime publication (mobile-expo-reviewer finding, post-implementation
-- adversarial pass: postgres_changes emits nothing for a table that isn't
-- explicitly added to a publication — config.toml's realtime.enabled=true
-- only starts the local Realtime server, it does not add any table.
-- Without this, features/transactions/hooks/useTransactionsRealtimeSync.ts's
-- subscription is structurally correct but a silent no-op against a real
-- Supabase project, undercutting the MVP-2 exit criterion "partner sees a
-- new transaction within 2 seconds." supabase_realtime is the publication
-- Supabase creates by default in every project (local and hosted).
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
$mig002body$],
  '002_financial_schema',
  'history-reconciliation-backfill',
  NULL,
  NULL
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (
  '003',
  ARRAY[$mig003body$-- OurMoney — Migration 003: Recurring generation + savings-goal completion (MVP-3)
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
$mig003body$],
  '003_recurring_generation_and_goal_completion',
  'history-reconciliation-backfill',
  NULL,
  NULL
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (
  '004',
  ARRAY[$mig004body$-- OurMoney — Migration 004: Account deletion (MVP-4 — Ship Quality / Milestone 9)
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
$mig004body$],
  '004_account_deletion',
  'history-reconciliation-backfill',
  NULL,
  NULL
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, statements, name, created_by, idempotency_key, rollback)
VALUES (
  '005',
  ARRAY[$mig005body$-- OurMoney — Migration 005: Leave household (admin-safe)
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
$mig005body$],
  '005_leave_household',
  'history-reconciliation-backfill',
  NULL,
  NULL
)
ON CONFLICT (version) DO NOTHING;

COMMIT;
