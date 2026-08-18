-- OurMoney — Migration 006: Transaction rule provenance
--
-- Closes the missing half of ADR-027 (docs/DECISIONS.md), which is also a
-- literal MVP-2 exit criterion (ROADMAP.md): "Every rule is visible and
-- editable in-app, AND a mis-categorised transaction leads the user to the
-- rule that caused it." Rules were already visible/editable/testable
-- in-app (app/(app)/settings/categories.tsx); the "leads the user to the
-- rule that caused it" half did not exist anywhere — a functionality audit
-- confirmed no column, hook, or UI ever recorded which rule (if any) set a
-- transaction's category, even though the matcher
-- (features/categories/lib/matchRule.ts's findMatchingRule) already
-- returns the full matched rule object at both call sites that use it
-- (features/transactions/hooks/useCreateTransaction.ts and
-- features/categories/hooks/useApplyRulesRetroactively.ts) — the
-- information existed transiently in memory and was discarded before the
-- write.
--
-- This migration adds exactly one nullable FK column and widens the two
-- transactions WITH CHECK policies that already validate FK coherence for
-- every other nullable reference on this row (account_id, category_id,
-- recurring_id, payer_id, created_by) to cover it the same way. It does
-- not change what rule matching selects (features/categories/lib/matchRule.ts
-- is untouched) — this is provenance and navigation, not rule-priority
-- redesign.
--
-- ============================================================================
-- Part 1 — transactions.matched_rule_id
-- ============================================================================
--
-- ON DELETE SET NULL (not RESTRICT/CASCADE): category_rules_delete permits
-- any household member to delete a rule at any time (migration 002) — a
-- transaction that rule once categorized must survive that deletion. The
-- FK doing the nulling automatically is also what satisfies "deleted-rule
-- transactions must degrade cleanly with no crash": the column simply
-- reads NULL afterward, and the UI already treats NULL as "no provenance
-- to show" for a normal never-auto-categorized transaction — the deleted-
-- rule case and the never-had-a-rule case are indistinguishable by design,
-- which is the correct, simplest behavior (no orphaned/dangling rule id
-- ever persists to be looked up and fail to resolve).
--
-- Nullable, no DEFAULT: every existing transaction (created before this
-- migration) correctly has no recorded provenance — there is no rule to
-- retroactively attribute a historical categorization to, since this
-- column did not exist when those rows were categorized.
ALTER TABLE transactions
  ADD COLUMN matched_rule_id UUID REFERENCES category_rules(id) ON DELETE SET NULL;

-- Matches every other FK index on this table (idx_transactions_account,
-- idx_transactions_category — migration 002) and keeps the ON DELETE SET
-- NULL cascade from category_rules efficient at any real household's
-- transaction volume.
CREATE INDEX idx_transactions_matched_rule ON transactions(matched_rule_id);

-- ============================================================================
-- Part 2 — transactions_insert / transactions_update: matched_rule_id
-- coherence
-- ============================================================================
--
-- Same shape as the existing category_id/recurring_id/payer_id coherence
-- legs already on these policies: a non-NULL matched_rule_id must belong
-- to a category_rules row in the SAME household as the transaction. Without
-- this, a client could (accidentally or otherwise) attribute a transaction
-- to another household's rule — not a data leak (category_rules has its
-- own household-scoped RLS, so the id alone reveals nothing), but a
-- correctness/integrity gap the existing pattern already closes for every
-- other reference column on this row, and matched_rule_id should not be
-- the one exception.
--
-- transactions_update is DROP+CREATE against its migration 004 form (the
-- one with `created_by IS NULL OR ...`, not the original migration 002
-- form) — migrations are immutable, so the live policy is the latest
-- version, and this migration widens that one, exactly as migration 004
-- did to migration 002's original.
DROP POLICY "transactions_insert" ON transactions;
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
    AND (
      matched_rule_id IS NULL
      OR matched_rule_id IN (SELECT id FROM category_rules WHERE category_rules.household_id = transactions.household_id)
    )
    AND created_by = auth.uid()
    AND (
      payer_id IS NULL
      OR payer_id IN (SELECT user_id FROM household_members WHERE household_members.household_id = transactions.household_id)
    )
  );

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
      matched_rule_id IS NULL
      OR matched_rule_id IN (SELECT id FROM category_rules WHERE category_rules.household_id = transactions.household_id)
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
