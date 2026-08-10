-- OurMoney — Migration 002: Financial schema (MVP-2 — Core Financial Loop)
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
