-- OurMoney — Migration 013: loan / mortgage account types
--
-- Foundation item from the Israeli-household product-evolution audit (Phase A
-- — account model). accounts.type is a closed enum-by-CHECK
-- ('checking','savings','credit_card','cash','investment','other' —
-- migration 002). Israeli households commonly track a loan (הלוואה) or
-- mortgage (משכנתא) as a distinct account so its balance shows in Accounts
-- and can be referenced by a transaction/transfer, the same way credit_card
-- already works.
--
-- No new columns, no RLS change: accounts' existing RLS policies (migration
-- 002/004) already scope by household_id regardless of type, and there is no
-- sign CHECK on balance_agorot, so a loan/mortgage account already supports
-- a negative balance (amount owed) with zero schema change beyond the type
-- list itself.
--
-- Safe-to-Spend / cash-flow: lib/engines/cashflow/eligibleCashAccounts.ts
-- uses an explicit whitelist (only 'checking','cash' count as spendable
-- cash), not a blacklist — the two new types are excluded automatically,
-- with no engine change required.
--
-- Postgres auto-named this constraint accounts_type_check (unnamed inline
-- CHECK, migration 002) — DROP by that name, matching the auto-generated
-- name Postgres assigns to `type TEXT ... CHECK (type IN (...))`.
ALTER TABLE accounts DROP CONSTRAINT accounts_type_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_type_check
  CHECK (type IN (
    'checking','savings','credit_card',
    'cash','investment','loan','mortgage','other'
  ));
