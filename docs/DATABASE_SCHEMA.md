# OurMoney — Database Schema

All monetary columns are `BIGINT` named `*_agorot`. 1 ILS = 100 agorot.
Negative amounts = expenses. Positive amounts = income.

This document describes the **MVP schema only**. Tables for Open Banking, engines, provenance, and
member permissions do not exist yet and are described in their respective future documents.

## Forward-compatibility principles

The schema is deliberately general in three places, so that later phases are additive migrations
rather than restructurings:

| Principle | What it enables later | Cost today |
|---|---|---|
| `household_members` is an N-row join table, not two columns on `households` | Children, teens, dependents, advisors | One join |
| All financial data is scoped by `household_id`, never by a user pair | Any future membership model | None |
| Authorization goes through helper *functions*, not inline policy SQL | Visibility rules narrow inside one function instead of across 40 policies | None |

**What must never be done:** add a column that assumes two members, scope financial data outside
`household_id`, or write a policy whose logic cannot be narrowed later.

See [ADR-006](DECISIONS.md#adr-006) and [ADR-019](DECISIONS.md#adr-019).

---

## Migration layout

This document specifies the complete MVP schema. It is delivered in three migrations:

| Migration | Phase | Contents |
|---|---|---|
| `001_initial_schema.sql` | MVP-1 | `profiles`, `households`, `household_members`, `invitations`, both RLS helpers, `create_household`, `accept_invitation`, and all their policies |
| `002_financial_schema.sql` | MVP-2 | `accounts`, `categories`, `category_rules`, `transactions`, `recurring_transactions`, `budgets`, `budget_allocations`, `savings_goals`, and all their policies. `recurring_transactions`/`savings_goals` shipped schema+RLS only in this migration — no UI/engine consumed them until MVP-3. |
| `003_recurring_generation_and_goal_completion.sql` | MVP-3 | No new tables. Adds `advance_recurring_due_date()`, `generate_recurring_transactions()`, `skip_recurring_occurrence()`, and a `derive_savings_goal_completion` trigger on the already-existing `savings_goals` table — see § Functions and Triggers. |

Each migration includes the RLS policies for the tables it creates, in the same file. Structural
guards 6.3 and 6.4 fail the build if a table lands without them.

**A note on this document's own accuracy:** the `recurring_transactions`/`savings_goals`/
`budget_allocations` RLS policy bodies below were found stale relative to the actual, shipped
migration 002 SQL during MVP-3 planning — the real migration adds cross-household FK-coherence
`WITH CHECK` clauses (D2) and `CHECK (amount_agorot <> 0)` constraints (D6) that were missing from
earlier drafts of this document. The sections below have been corrected to match
`supabase/migrations/002_financial_schema.sql` verbatim; treat the migration file itself as
authoritative if the two ever diverge again.

---

## Tables

### profiles

Extends `auth.users`. Created automatically via trigger on user sign-up.

```sql
CREATE TABLE profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL,
  avatar_url    TEXT,
  locale        TEXT        NOT NULL DEFAULT 'he',
  timezone      TEXT        NOT NULL DEFAULT 'Asia/Jerusalem',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLS: users can read all profiles (needed for displaying partner names), but can only update their own.

---

### households

```sql
CREATE TABLE households (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'ILS',
  created_by  UUID        NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### household_members

```sql
CREATE TABLE household_members (
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'member'
                            CHECK (role IN ('admin', 'member')),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (household_id, user_id)
);
```

**Supports N members by design.** The UX is optimized for two partners; the schema assumes nothing
of the kind.

> **Future (POST-MVP, not now):** richer membership is an additive migration on this table —
> a `member_type` column (`adult_partner`, `adult_member`, `teen`, `child`, `dependent`, `advisor`)
> with a default, plus a visibility policy. No financial table is touched, because all financial data
> is already scoped by `household_id` and all policies already delegate to `is_household_member()`.
> Narrowing visibility means changing that one function, not forty policies.
> See [ADR-019](DECISIONS.md#adr-019).

---

### invitations

```sql
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
```

---

### accounts

```sql
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
```

`owner_id = NULL` means the account belongs to the whole household.
`owner_id = some_user_id` means it is that member's personal account.

---

### categories

```sql
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
```

`household_id = NULL` means this is a system category visible to all households.
System categories have `is_system = TRUE` and cannot be modified or deleted by users.

---

### category_rules

```sql
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
```

---

### recurring_transactions

```sql
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
```

---

### transactions

```sql
CREATE TABLE transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id       UUID        NOT NULL REFERENCES accounts(id),
  category_id      UUID        REFERENCES categories(id),
  recurring_id     UUID        REFERENCES recurring_transactions(id),
  amount_agorot    BIGINT      NOT NULL,
  currency         TEXT        NOT NULL DEFAULT 'ILS',
  description      TEXT        NOT NULL,
  merchant_name    TEXT,
  -- The date money moves for THIS ROW. Not the purchase date, not the statement
  -- date. One row = one movement. See "Transaction identity" below.
  txn_date         DATE        NOT NULL,
  -- BUDGET ATTRIBUTION ONLY. Does this count toward the household budget?
  -- This is NOT a visibility flag and must never be used as one. See
  -- "Visibility" below.
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
```

### Transaction identity — the invariants that keep future models additive

`transactions` is the most-referenced table in the schema. Two capabilities we know are coming —
**installments (תשלומים)** and **per-member visibility** — must be addable **without redefining what
a transaction row means**. That requires holding four invariants from migration 002 onward. They cost
nothing now and are expensive to retrofit.

| # | Invariant | Why |
|---|---|---|
| **I1** | **One row = one movement of money at one point in time.** A row is *not* "a purchase" and *not* "a bill" | A 12-instalment purchase becomes 12 rows linked to one plan. If a row meant "a purchase", installments would force a redefinition of every existing row |
| **I2** | **`id` is an opaque surrogate UUID, never derived from business fields, never reused** | A future `installment_plan_id` or `statement_id` FK points at rows that must remain stable |
| **I3** | **`txn_date` has exactly one meaning: the date money moves for this row.** Not the purchase date, not the statement date | Charge-date modelling adds a *new* column later. If `txn_date` were overloaded now, its meaning would have to change — a data migration on every row |
| **I4** | **No UNIQUE constraint on business fields** (merchant, amount, date). Deduplication is application logic over a scored match, not a database constraint | Twelve identical monthly instalments are legitimately near-identical rows. A unique constraint would reject correct data |

**Also:** `is_shared` is budget attribution only, and `is_excluded` is user-driven exclusion only.
Neither may be overloaded to mean visibility, installment status, or anything else. Overloading a
boolean is how the next person is forced into a migration.

### Future model — installments (NOT in MVP)

Resolved by [Q18](DECISIONS.md#open-questions): **no installment columns in the MVP schema.**
Recorded here so the shape is agreed before it is needed.

```sql
-- FUTURE. Does not exist. Do not create in MVP.

-- One row per instalment purchase. The economic event.
CREATE TABLE installment_plans (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id       UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id         UUID NOT NULL REFERENCES accounts(id),
  merchant_name      TEXT,
  description        TEXT NOT NULL,
  total_agorot       BIGINT NOT NULL,
  installment_count  INTEGER NOT NULL CHECK (installment_count > 0),
  first_charge_date  DATE NOT NULL,
  category_id        UUID REFERENCES categories(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each instalment IS a transaction (I1). The link is one nullable FK.
ALTER TABLE transactions
  ADD COLUMN installment_plan_id UUID REFERENCES installment_plans(id),
  ADD COLUMN installment_index   INTEGER;   -- 1..installment_count

-- The aggregated monthly card charge Israeli households actually feel.
CREATE TABLE card_statements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id),
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  charge_date    DATE NOT NULL,      -- when the bank account is actually debited
  total_agorot   BIGINT NOT NULL
);

ALTER TABLE transactions
  ADD COLUMN statement_id UUID REFERENCES card_statements(id);
```

**Why this is purely additive:** every change is a new table or a **nullable** column. No existing
column changes meaning, no existing row is rewritten, no constraint tightens, and `transactions.id`
keeps referential stability. Existing budget and dashboard queries continue to work unchanged
because each instalment is already a normal transaction on its own `txn_date`.

**What MVP must therefore avoid:** entering a 12-instalment purchase as one ₪12,000 transaction. In
MVP the user enters what actually hits the account. Guidance belongs in the UI copy, not the schema.

### Future model — visibility (NOT in MVP)

Resolved by [ADR-029](DECISIONS.md#adr-029). MVP UX offers exactly two states — **shared** and
**personal** — and those map to `is_shared`, which is **budget attribution, not visibility**. Every
member of a household can see every row in MVP.

```sql
-- FUTURE. Does not exist. Do not create in MVP.

ALTER TABLE transactions
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'household'
    CHECK (visibility IN ('household','private','selected'));

-- Only needed for 'selected'. 'private' resolves to created_by.
CREATE TABLE transaction_visibility_grants (
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, user_id)
);
```

The same pattern applies to any future financial object that needs it — `accounts`,
`savings_goals` — which is why it is expressed as a pattern rather than a one-off.

**Why this is purely additive:** a nullable-with-default column plus a new table. The
`DEFAULT 'household'` means every existing row keeps today's behaviour with no backfill.

**The one thing MVP must get right for this to work** is where the check lives. Visibility narrowing
must happen **inside `is_household_member()` or a sibling helper**, never inlined into forty
policies — see [ADR-008](DECISIONS.md#adr-008). Today the helper answers *"is this user in this
household?"*; later it answers *"is this user in this household **and** permitted to see this
row?"*. That is one function to change.

---

### budgets

```sql
CREATE TABLE budgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  UUID        NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  period_start  DATE        NOT NULL,
  period_end    DATE        NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (household_id, period_start)
);
```

---

### budget_allocations

```sql
CREATE TABLE budget_allocations (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    UUID    NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  budget_id       UUID    NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id     UUID    NOT NULL REFERENCES categories(id),
  amount_agorot   BIGINT  NOT NULL CHECK (amount_agorot > 0),
  UNIQUE (budget_id, category_id)
);
```

`household_id` is denormalized here deliberately. Every financial table carries it so that RLS
policies are a single `is_household_member(household_id)` call rather than a subquery through
`budgets` — consistent with the forward-compatibility principle above, and the reason future
visibility narrowing is a one-function change.

---

### savings_goals

```sql
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
```

---

## Indexes

```sql
-- RLS inner lookup — most critical index in the schema
CREATE INDEX idx_household_members_user ON household_members(user_id, household_id);

-- Transaction queries (most frequent read)
CREATE INDEX idx_transactions_household_date  ON transactions(household_id, txn_date DESC);
CREATE INDEX idx_transactions_account         ON transactions(account_id);
CREATE INDEX idx_transactions_category        ON transactions(category_id);
CREATE INDEX idx_transactions_household_shared ON transactions(household_id, is_shared);

-- Budget queries
CREATE INDEX idx_budgets_household_period     ON budgets(household_id, period_start);
CREATE INDEX idx_budget_allocations_budget    ON budget_allocations(budget_id);
CREATE INDEX idx_budget_allocations_household ON budget_allocations(household_id);

-- Invitation lookup by token
CREATE INDEX idx_invitations_token            ON invitations(token);
CREATE INDEX idx_invitations_email            ON invitations(email);

-- Category rules matching
CREATE INDEX idx_category_rules_household     ON category_rules(household_id, is_active);

-- Recurring due date check
CREATE INDEX idx_recurring_due_date           ON recurring_transactions(next_due_date)
  WHERE is_active = TRUE;

-- Categories by household (includes NULLs = system categories)
CREATE INDEX idx_categories_household         ON categories(household_id);
```

---

## Functions and Triggers

### updated_at trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON households
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Auto-create profile on sign-up

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp        -- mandatory for SECURITY DEFINER
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trigger functions are invoked by the trigger, never called directly.
-- PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION — revoke it.
REVOKE ALL ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;
```

### Rules for every SECURITY DEFINER function

There are five in this schema: `handle_new_user`, `is_household_member`, `is_household_admin`,
`create_household`, `accept_invitation`. All five must:

1. Set an explicit `search_path` — enforced by structural test 6.5.
2. Have `EXECUTE` revoked from `PUBLIC` and `anon` — enforced by structural test 6.6.

Rule 2 needs stating explicitly because **PostgreSQL grants `EXECUTE` to `PUBLIC` by default** on
`CREATE FUNCTION`. Omitting the `REVOKE` therefore exposes a definer-rights function to anonymous
callers silently. Guard 6.6 exists precisely to catch that omission, and it would have failed on
day one against an earlier draft of this schema.

### RLS helpers

These are the single point through which all authorization flows. Future visibility rules extend
these functions rather than every individual policy.

```sql
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

-- Called from inside RLS policies, which execute as the invoking role.
-- authenticated needs EXECUTE; anon and PUBLIC must not have it.
REVOKE ALL ON FUNCTION is_household_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION is_household_admin(UUID)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_household_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_household_admin(UUID)  TO authenticated;
```

Both set an explicit `search_path` to prevent search-path hijacking, which is mandatory for any
`SECURITY DEFINER` function.

---

### create_household

Creating a household means inserting into two tables. Doing it client-side in two calls is
non-atomic: if the first succeeds and the second fails, the result is an orphaned household whose
own creator is not a member — and since `households_select` requires membership, that row is
invisible and unrecoverable to them.

There is also no INSERT policy on `household_members` (see the RLS section below), so this is the only way
membership can be created outside of an invitation.

```sql
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
```

Both inserts are in one function body, so they commit together or not at all. The creator is always
`admin` — the role is set by the function, never supplied by the caller.

---

### accept_invitation

The other deliberate exception to "RLS enforces everything." An invitee cannot read their own
invitation under RLS, because the policy requires household membership they do not yet have.

This function is a hole in the security boundary, so every one of the ten conditions in
[ADR-010](DECISIONS.md#adr-010) is required, and each is individually tested in `rls_tests.sql`.

```sql
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

  -- ADR-020 one-household-per-user, checked BEFORE the token is examined.
  -- Order matters: if this ran after validation, the caller could distinguish a
  -- valid token ('already_in_household') from an invalid one ('invalid_invitation'),
  -- which is exactly the oracle condition (9) forbids.
  -- The already-a-member case is handled inside this branch so a repeat tap still works.
  IF EXISTS (SELECT 1 FROM household_members WHERE user_id = v_user_id) THEN
    -- (6) already a member of the household this token targets: idempotent success.
    -- Any status is accepted here, including expired/cancelled — the user is already
    -- where the token would have put them, so surfacing an error would be misleading.
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

  -- (9) generic failure — never reveal whether the token existed,
  --     had already been used, or merely expired.
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
```

**Notes on the design**

- The function returns a result object rather than raising, so the client distinguishes failure
  modes without parsing error strings — while the *invitee-facing* error stays generic.
- `FOR UPDATE` is what makes double-acceptance impossible under concurrency. Without it, two
  simultaneous calls could both read `status = 'pending'`.
- The already-member branch returns success deliberately: a user who taps the link twice should
  land in the household, not see an error. It matches on **any** invitation status, so an expired
  or cancelled token for a household the user is already in still resolves cleanly rather than
  producing a confusing `already_in_household`.
- The already-member branch does **not** consume the invitation. A token tapped by someone already
  in that household stays `pending` and remains usable by its intended recipient — which is the
  desired behavior when a link is forwarded in a group chat.
- The one-household-per-user check enforces [ADR-020](DECISIONS.md#adr-020) at the database, not
  just in the UI, and runs before token validation so it cannot become a validity oracle.

---

### Migration 003 — recurring generation and savings-goal completion (MVP-3)

Three callable functions and one trigger, no new tables. Every function has a fixed
`SET search_path = public, pg_temp`, matching migrations 001/002's convention — including the pure
SQL helper and the trigger function, not only the two RPCs.

**`advance_recurring_due_date(p_due_date DATE, p_frequency TEXT, p_day_of_month INTEGER) RETURNS DATE`**
— pure, `LANGUAGE sql IMMUTABLE`, no table access. Daily/weekly/biweekly add fixed day counts;
monthly/quarterly/yearly step N months and clamp to `day_of_month` (so a 31st-of-month template lands
on Feb 28/29, then returns to the 31st in March — always re-derived from the stored `day_of_month`,
never from the previous computed date, which is what prevents permanent drift after a short month).
Its TypeScript mirror, `features/recurring/lib/recurringDueDate.ts`, is the unit-tested reference
implementation used for client-side preview display only; this SQL function is authoritative for the
actual mutation. `supabase/rls_tests.sql`'s `DB.PARITY.*` group asserts both agree on the same
fixture table.

**`generate_recurring_transactions() RETURNS JSONB`** — `SECURITY INVOKER`, no parameters. The client
sends nothing generation-specific: the function resolves the caller's household from
`household_members`, locks every due (`next_due_date <= CURRENT_DATE`) active template
(`SELECT ... FOR UPDATE`, ordered by `id` to avoid deadlocking a concurrent call from the other
household member), and for each one sequentially generates every missed occurrence — reading
`amount_agorot`/`account_id`/`category_id`/`description`/`is_shared` from the locked row itself, never
from client input. Idempotency comes from the row lock plus a re-read under READ COMMITTED: a
duplicate or concurrent call simply blocks until the first commits, then sees the already-advanced
`next_due_date` and generates nothing further for that template. Being `SECURITY INVOKER`, every
`INSERT INTO transactions` and `UPDATE recurring_transactions` inside it still runs under the caller's
own RLS (including the D2 coherence checks above) — no bypass.

**`skip_recurring_occurrence(p_recurring_id UUID) RETURNS JSONB`** — `SECURITY INVOKER`, the explicit
"skip a single occurrence" action. Requires `is_active = TRUE` in its own `SELECT ... FOR UPDATE` —
an inactive or inaccessible (not-a-member's) template returns the same generic `not_found` and its
`next_due_date` is left untouched. Reuses `advance_recurring_due_date()` for the single-step advance;
generates no transaction.

**`derive_savings_goal_completion()`** — `BEFORE INSERT OR UPDATE` trigger on `savings_goals`,
unconditionally setting `NEW.is_completed := NEW.current_agorot >= NEW.target_agorot`. This is the
single source of truth for `is_completed` — a client-supplied value is silently overridden regardless
of write path. Trigger-only: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` with no `GRANT` at all,
mirroring migration 001's `handle_new_user()`.

---

## Row-Level Security Policies

### profiles

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read profiles (needed to show partner name)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (TRUE);

-- Users can only update their own profile
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());
```

### households

```sql
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "households_select" ON households
  FOR SELECT TO authenticated USING (is_household_member(id));

-- NO INSERT POLICY. Households are created only by create_household().
-- A direct client INSERT would succeed here but the follow-up membership INSERT
-- would fail (household_members has no INSERT policy), leaving an orphaned
-- household that its own creator cannot see — households_select requires
-- membership. Denying the insert outright is the only way to make that
-- unreachable state actually unreachable.

CREATE POLICY "households_update" ON households
  FOR UPDATE TO authenticated USING (is_household_admin(id));
```

### household_members

```sql
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;

-- Members can see who else is in their household
CREATE POLICY "household_members_select" ON household_members
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- NO INSERT POLICY. NO UPDATE POLICY. This is deliberate.
-- Membership is created exclusively by create_household() and accept_invitation(),
-- both SECURITY DEFINER. Roles are never changed by clients.

-- Admins can remove members; members can remove themselves
CREATE POLICY "household_members_delete" ON household_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid() OR is_household_admin(household_id)
  );
```

> **Why there is no INSERT policy — this is a security-critical design point.**
>
> The obvious policy, `WITH CHECK (user_id = auth.uid())`, is catastrophically wrong. It constrains
> only *who* is being inserted, not *which household* or *what role*. Any authenticated user could:
>
> - insert themselves into **any** household by ID, reading every financial row in it; or
> - delete their own `member` row (permitted above) and re-insert it with `role = 'admin'`,
>   defeating every admin-only policy in the schema.
>
> Because RLS `WITH CHECK` cannot express "only as part of a validated invitation," the correct
> answer is to grant no INSERT at all and route both legitimate paths through `SECURITY DEFINER`
> functions that validate properly. Tests 3b.1–3b.7 verify this.
>
> There is likewise no UPDATE policy, so `role` cannot be changed by a client under any circumstance.
> Promoting a member to admin is not an MVP feature; when it is added, it will be another audited
> `SECURITY DEFINER` function, not a policy.

### invitations

```sql
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Household members can see invitations for their household
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated
  USING (is_household_member(household_id));

-- Anyone can read a specific invitation by token (for acceptance)
-- This is handled by a SECURITY DEFINER function, not a permissive policy

-- Only admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (is_household_admin(household_id));

-- Admins can cancel invitations
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (is_household_admin(household_id));
```

### accounts

```sql
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select" ON accounts
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT TO authenticated WITH CHECK (is_household_member(household_id));

CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE TO authenticated USING (is_household_member(household_id));

-- Only admins can delete accounts
CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE TO authenticated USING (is_household_admin(household_id));
```

### categories

```sql
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- System categories (household_id IS NULL) are visible to all authenticated users
-- Household categories are visible only to members
CREATE POLICY "categories_select" ON categories
  FOR SELECT TO authenticated
  USING (
    household_id IS NULL
    OR is_household_member(household_id)
  );

-- System categories cannot be created by users (household_id IS NULL is blocked)
CREATE POLICY "categories_insert" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (
    household_id IS NOT NULL
    AND is_household_member(household_id)
    AND is_system = FALSE
  );

CREATE POLICY "categories_update" ON categories
  FOR UPDATE TO authenticated
  USING (
    household_id IS NOT NULL
    AND is_household_member(household_id)
    AND is_system = FALSE
  );

-- Admin-only, consistent with other shared-resource deletes (accounts, budgets)
CREATE POLICY "categories_delete" ON categories
  FOR DELETE TO authenticated
  USING (
    household_id IS NOT NULL
    AND is_household_admin(household_id)
    AND is_system = FALSE
  );
```

### category_rules

```sql
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_rules_select" ON category_rules
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "category_rules_insert" ON category_rules
  FOR INSERT TO authenticated WITH CHECK (is_household_member(household_id));

CREATE POLICY "category_rules_update" ON category_rules
  FOR UPDATE TO authenticated USING (is_household_member(household_id));

CREATE POLICY "category_rules_delete" ON category_rules
  FOR DELETE TO authenticated USING (is_household_member(household_id));
```

### transactions

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select" ON transactions
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT TO authenticated WITH CHECK (is_household_member(household_id));

CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE TO authenticated USING (is_household_member(household_id));

-- Soft delete only: transactions use is_excluded. Hard delete requires admin.
CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE TO authenticated USING (is_household_admin(household_id));
```

### budgets

```sql
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budgets_select" ON budgets
  FOR SELECT TO authenticated USING (is_household_member(household_id));

CREATE POLICY "budgets_insert" ON budgets
  FOR INSERT TO authenticated WITH CHECK (is_household_member(household_id));

CREATE POLICY "budgets_update" ON budgets
  FOR UPDATE TO authenticated USING (is_household_member(household_id));

CREATE POLICY "budgets_delete" ON budgets
  FOR DELETE TO authenticated USING (is_household_admin(household_id));
```

### budget_allocations

```sql
ALTER TABLE budget_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_allocations_select" ON budget_allocations
  FOR SELECT TO authenticated USING (is_household_member(household_id));

-- WITH CHECK also verifies the referenced budget belongs to the same household,
-- so a member cannot attach an allocation to another household's budget.
CREATE POLICY "budget_allocations_insert" ON budget_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    is_household_member(household_id)
    AND budget_id IN (SELECT id FROM budgets WHERE budgets.household_id = budget_allocations.household_id)
  );

-- WITH CHECK repeats the coherence test: without it, a member could UPDATE an
-- allocation to point at another household's budget_id.
CREATE POLICY "budget_allocations_update" ON budget_allocations
  FOR UPDATE TO authenticated
  USING (is_household_member(household_id))
  WITH CHECK (
    is_household_member(household_id)
    AND budget_id IN (SELECT id FROM budgets WHERE budgets.household_id = budget_allocations.household_id)
  );

CREATE POLICY "budget_allocations_delete" ON budget_allocations
  FOR DELETE TO authenticated USING (is_household_member(household_id));
```

### recurring_transactions

```sql
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_select" ON recurring_transactions
  FOR SELECT TO authenticated USING (is_household_member(household_id));

-- D2: account_id/category_id must belong to the same household (or be a
-- system category) — the FK alone only guarantees the row exists, not that
-- it's this household's. created_by is pinned to the inserting user on
-- INSERT, but only required to resolve to a current household member on
-- UPDATE (co-editing between members stays possible).
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
```

### savings_goals

```sql
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "savings_goals_select" ON savings_goals
  FOR SELECT TO authenticated USING (is_household_member(household_id));

-- D2: account_id (nullable) must belong to the same household when present.
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
```

Milestone 7 adds one more trigger to this table — `derive_completion` (`BEFORE INSERT OR UPDATE`,
calling `derive_savings_goal_completion()`) — unconditionally setting
`is_completed := current_agorot >= target_agorot` on every write. See § Functions and Triggers.
`is_completed` should never be treated as client-authoritative — this trigger is the single source
of truth for it, regardless of which write path sets `current_agorot`.

---

## RLS Security Tests

All tests live in `supabase/rls_tests.sql`. **They must pass before any migration is merged.**

Each test runs inside a transaction that is rolled back, so the database is never modified.
Tests impersonate users with:

```sql
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
```

### Fixtures

| Fixture | Description |
|---|---|
| Household 1 | User A (admin), User B (member) |
| Household 2 | User C (admin) |
| User D | Authenticated, belongs to no household |

### Group 1 — Cross-household isolation

Every financial table is tested. A gap here is a data breach.

| # | Test | Expected |
|---|---|---|
| 1.1 | User A SELECTs Household 2's `transactions` | 0 rows |
| 1.2 | User A INSERTs a transaction with `household_id` = Household 2 | rejected |
| 1.3 | User A UPDATEs a Household 2 transaction | 0 rows affected |
| 1.4 | User A DELETEs a Household 2 transaction | 0 rows affected |
| 1.5 | User A SELECTs Household 2's `accounts` | 0 rows |
| 1.6 | User A SELECTs Household 2's `budgets` | 0 rows |
| 1.7 | User A SELECTs Household 2's `budget_allocations` | 0 rows |
| 1.8 | User A SELECTs Household 2's `categories` | 0 rows |
| 1.9 | User A SELECTs Household 2's `category_rules` | 0 rows |
| 1.10 | User A SELECTs Household 2's `recurring_transactions` | 0 rows |
| 1.11 | User A SELECTs Household 2's `savings_goals` | 0 rows |
| 1.12 | User A SELECTs Household 2's `invitations` | 0 rows |
| 1.13 | User A SELECTs Household 2's `household_members` | 0 rows |
| 1.14 | User A SELECTs Household 2 in `households` | 0 rows |

### Group 2 — Unaffiliated user

| # | Test | Expected |
|---|---|---|
| 2.1 | User D SELECTs `households` | 0 rows |
| 2.2 | User D SELECTs `transactions` | 0 rows |
| 2.3 | User D SELECTs `accounts` | 0 rows |
| 2.4 | User D SELECTs `budgets` | 0 rows |
| 2.5 | User D SELECTs `savings_goals` | 0 rows |
| 2.6 | User D SELECTs `invitations` | 0 rows |
| 2.7 | User D INSERTs into any household's `transactions` | rejected |

### Group 3 — Role enforcement within a household

| # | Test | Expected |
|---|---|---|
| 3.1 | User B (member) DELETEs a Household 1 transaction | 0 rows affected — admin only |
| 3.2 | User B DELETEs a Household 1 account | 0 rows affected — admin only |
| 3.3 | User B creates an invitation for Household 1 | rejected — admin only |
| 3.4 | User B UPDATEs the Household 1 name | 0 rows affected — admin only |
| 3.5 | User B DELETEs a Household 1 custom category | 0 rows affected — admin only |
| 3.6 | User B INSERTs a Household 1 transaction | succeeds |
| 3.7 | User B removes themselves from `household_members` | succeeds |
| 3.8 | User A (admin) removes User B | succeeds |

### Group 3b — Membership tampering

These cover the attack surface that a naive `WITH CHECK (user_id = auth.uid())` INSERT policy would
open. They are the reason `household_members` has no INSERT or UPDATE policy at all.

| # | Test | Expected |
|---|---|---|
| 3b.1 | User D INSERTs themselves into Household 1 directly | rejected — no INSERT policy |
| 3b.2 | User B INSERTs a second row for themselves with `role = 'admin'` | rejected — no INSERT policy |
| 3b.3 | User B DELETEs their own row, then re-INSERTs it as `admin` | delete succeeds, insert rejected |
| 3b.4 | User B UPDATEs their own row to `role = 'admin'` | rejected — no UPDATE policy |
| 3b.5 | User A (admin) UPDATEs User B to `role = 'admin'` | rejected — no UPDATE policy in MVP |
| 3b.6 | User C INSERTs User A into Household 2 | rejected — no INSERT policy |
| 3b.7 | After 3b.3, User B is still `member` | verified |
| 3b.8 | User D INSERTs directly into `households` | rejected — no INSERT policy on `households` either |

### Group 3c — `create_household`

| # | Test | Expected |
|---|---|---|
| 3c.1 | User D calls `create_household('בית חדש')` | `{ok: true}`, household + admin membership both created |
| 3c.2 | Caller is `anon` | `EXECUTE` denied |
| 3c.3 | User A (already in Household 1) calls it | `{ok: false, error: 'already_in_household'}`, no household created |
| 3c.4 | Called with an empty or whitespace-only name | `{ok: false, error: 'invalid_name'}` |
| 3c.5 | Called with a name over 100 characters | `{ok: false, error: 'invalid_name'}` |
| 3c.6 | Force the membership INSERT to fail | no orphaned `households` row remains |
| 3c.7 | Creator's role after 3c.1 | `admin` |

### Group 4 — Categories

| # | Test | Expected |
|---|---|---|
| 4.1 | Any authenticated user SELECTs system categories (`household_id IS NULL`) | visible |
| 4.2 | User A creates a category with `household_id = NULL` | rejected |
| 4.3 | User A creates a category with `is_system = TRUE` | rejected |
| 4.4 | User A UPDATEs a system category | 0 rows affected |
| 4.5 | User A DELETEs a system category | 0 rows affected |
| 4.6 | User A creates a custom category for Household 1 | succeeds |

### Group 5 — `accept_invitation` hardening

One test per condition in [ADR-010](DECISIONS.md#adr-010). This function bypasses RLS, so its
test coverage must be exhaustive.

| # | ADR condition | Test | Expected |
|---|---|---|---|
| 5.1 | (1) fixed `search_path` | Inspect `pg_proc.proconfig` for the function | contains `search_path=public, pg_temp` |
| 5.2 | (2) requires auth | Call with no `sub` claim | `{ok: false, error: 'unauthenticated'}` |
| 5.3 | (3) valid token | Call with a nonexistent token | `{ok: false, error: 'invalid_invitation'}` |
| 5.4 | (4) no replay | Call twice with the same token from two different eligible users | second returns `invalid_invitation` |
| 5.5 | (4) status | Call with a `cancelled` invitation | `invalid_invitation` |
| 5.6 | (5) expiry | Call with a token whose `expires_at` is in the past | `invalid_invitation` |
| 5.7 | (6) no duplicate membership | Member of Household 1 calls with a Household 1 token | `{ok: true, already_member: true}`, membership count unchanged |
| 5.8 | (7) atomicity | Force the invitation UPDATE to fail mid-function | no `household_members` row inserted |
| 5.9 | (8) concurrency | Two concurrent calls, same token, two eligible users | exactly one membership created |
| 5.10 | (9) no information leak | Compare responses for nonexistent / expired / cancelled / consumed tokens | byte-identical |
| 5.11 | (9) no oracle | User already in Household 1 calls with a **valid** Household 2 token, then with an **invalid** token | both return `already_in_household` — the ADR-020 check runs before token validation, so a valid token is not distinguishable |
| 5.12 | (10) grants | Inspect `information_schema.role_routine_grants` | `authenticated` only; `anon` and `PUBLIC` absent |
| 5.13 | (10) grants | Call with `role = anon` | `EXECUTE` denied |
| 5.14 | ADR-020 | User already in Household 1 calls with a valid Household 2 token | `{ok: false, error: 'already_in_household'}`, no membership change |
| 5.15 | happy path | User D calls with a valid Household 1 token | `{ok: true}`, membership created, invitation `accepted` |
| 5.16 | role | Membership created by 5.15 | `role = 'member'`, never `admin` |
| 5.17 | already-member, stale token | User B calls with an **expired** Household 1 token | `{ok: true, already_member: true}` — not `already_in_household` |
| 5.18 | already-member does not consume | User B calls with a pending Household 1 token, then User D calls with the same token | User D still joins successfully |

### Group 6 — Structural guards

| # | Test | Expected |
|---|---|---|
| 6.1 | `is_household_member` has a fixed `search_path` | verified via `pg_proc.proconfig` |
| 6.2 | `is_household_admin` has a fixed `search_path` | verified via `pg_proc.proconfig` |
| 6.3 | Every table in `public` has `rowsecurity = true` | verified via `pg_tables` |
| 6.4 | No table in `public` has zero policies | verified via `pg_policies` |
| 6.5 | **Every** `SECURITY DEFINER` function in `public` has a `search_path` in `proconfig` | verified via `pg_proc` — catches `handle_new_user`, `create_household`, `accept_invitation`, and anything added later |
| 6.6 | No `SECURITY DEFINER` function has `EXECUTE` granted to `anon` or `PUBLIC` | verified via `information_schema.role_routine_grants` |
| 6.7 | Every table with a `household_id` column has at least one policy referencing `is_household_member` or `is_household_admin` | verified via `pg_policies` text match |

Tests 6.3–6.7 are **structural guards**, and they are the most valuable tests in the suite. They are
written once and then catch entire classes of future mistake automatically:

- 6.3 / 6.4 catch a migration that adds a table and forgets its RLS policies.
- 6.5 catches a `SECURITY DEFINER` function added without a fixed `search_path` — the exact defect
  that existed in `handle_new_user` before review.
- 6.6 catches a privileged function accidentally exposed to anonymous callers.
- 6.7 catches a policy that looks plausible but does not actually scope by household.

A guard that fails loudly on a future migration is worth more than any number of hand-written
row-level assertions.

---

## Entity Relationship Summary

```
auth.users (Supabase)
    │ 1:1
    └── profiles
    │
    └── household_members ──── households
              │                    │
              │            ┌───────┼───────────────────┐
              │            │       │                   │
              │         accounts  budgets          invitations
              │            │       │
              │       transactions budget_allocations
              │            │
              │       recurring_transactions
              │
              └── savings_goals

categories (household_id nullable — system or household-specific)
category_rules (per household)
```

---

## Future tables — NOT in MVP

Listed only so it is clear they were considered and deliberately excluded. None of these appear in
migration 001, and no MVP code may reference them.

| Future table | Phase | Purpose |
|---|---|---|
| `ob_providers`, `ob_connections`, `ob_sync_log` | OPEN BANKING | Bank connections. Tokens live in Supabase Vault, never in a table column. See [OPEN_BANKING.md](OPEN_BANKING.md). |
| `domain_events` | OPEN BANKING | Durable event log, when the dispatcher moves off in-process. MVP emits in-process with no persistence. |
| `notification_preferences` | POST-MVP | Per-member, per-event, per-channel routing rules. |
| `member_type` column on `household_members` | POST-MVP | Additive. Teens, children, dependents, advisors. |
| `assets`, `liabilities` | INTELLIGENCE | Balance sheet for net-worth tracking. |
| `insights` | INTELLIGENCE | Engine output with provenance, confidence, and expiry. |
| `external_rules` | INTELLIGENCE | Versioned tax/benefit/rate data with `source`, `effective_date`, `retrieved_at`, `rule_version`. |
| `mortgages`, `mortgage_tracks` | FINANCIAL OPTIMIZATION | Multi-track Israeli mortgage model. |
| `debts` | FINANCIAL OPTIMIZATION | Loans, overdraft, card balances. |
| `recommendations` | FINANCIAL OPTIMIZATION | Action Engine output with impact, confidence, risks. |

### Rules for adding any of these later

1. Every new table with household data gets `household_id` and RLS policies **in the same migration**.
2. Every new table gets isolation tests in `rls_tests.sql` **in the same PR**.
3. Structural guards 6.3 and 6.4 will fail the build if either is forgotten.
4. Bank tokens are never stored in a regular column — Vault only.
