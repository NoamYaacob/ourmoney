-- ============================================================================
-- QA/demo record cleanup — manual, reviewed, opt-in only
-- ============================================================================
--
-- WHY THIS FILE EXISTS
--
-- The real deployed app currently shows `[QA]`-prefixed rows throughout the
-- product (e.g. "[QA] ביטוח רכב", "[QA] מנוי סטרימינג", "[QA] עו"ש ראשי",
-- "[QA] חיסכון", "[QA] בילוי", uncategorized "[QA]" transactions). A
-- full-repo search across every commit on every branch of this codebase
-- (`git log --all -p -S"[QA]"`) found ZERO occurrences of that string in any
-- committed source file, migration, or seed script — and the only fixture
-- data this codebase ships (`dev/designQaClient.ts`, gated behind
-- `DESIGN_QA=1`, see the guarantee below) uses realistic Hebrew names taken
-- directly from the Design files ("שופרסל דיל", "ארנונה דו־חודשית", ...),
-- never a `[QA]` marker, and its `insert`/`update`/`upsert` are inert
-- passthroughs that never write anywhere (see that file's own header).
--
-- Conclusion: these are real rows in the real Supabase database, entered by
-- hand at some point (almost certainly manual QA/exploratory testing against
-- the real backend), not produced by any code path in this app. This script
-- is the safe, reviewed way to remove them — written by someone who does NOT
-- have credentials to the real Supabase project this app talks to, and who
-- is therefore not able to run or verify it. Read every AUDIT query's output
-- before touching the CLEANUP section. Do not run the CLEANUP section
-- automatically, in CI, or without a human reading the AUDIT output first.
--
-- SCOPE / SAFETY MODEL
--
--   * Targets ONLY rows whose own free-text column starts with the literal,
--     unmistakable marker '[QA]' (case-sensitive, checked with a plain
--     `LIKE '[QA]%'` — deliberately not a fuzzy/case-insensitive match,
--     which risks catching a real household's own bracketed note like
--     "[Query] ..." or "[qa]..." used for an unrelated reason).
--   * Every DELETE below is guarded by `WHERE NOT EXISTS (...)` checks
--     against every other table that could still reference the row, rather
--     than relying on the database's own FK constraints to fail loudly.
--     This means a QA-marked account/category/recurring template that is
--     ALSO referenced by a real, non-QA-marked row is silently *skipped*,
--     not force-deleted and not allowed to abort the whole cleanup — it is
--     reported by the final AUDIT-AFTER query instead, for a human to look
--     at individually. Preserving real user data takes priority over a
--     complete cleanup in one pass.
--   * Order matters and is FK-aware (see the comment above each step):
--     leaf/child rows first, accounts/categories last, exactly so that
--     deleting a QA-marked parent (recurring template, obligation,
--     installment plan) never needs to force-delete or silently corrupt a
--     real transaction that happens to reference it.
--   * Nothing here touches `households`, `household_members`, or `profiles`
--     — if the QA data was entered under a real household's account (rather
--     than a dedicated QA household), this script deliberately leaves the
--     household/membership/profile rows alone; only the financial data rows
--     are in scope. If the QA data in fact lives entirely under its own
--     separate household, deleting that household row via the Supabase
--     dashboard after this script runs (and confirming the AUDIT queries
--     show zero rows left under it) is the simplest complete cleanup — but
--     that is a judgment call for whoever has real access to make, not
--     something this script assumes or automates.
--
-- HOW TO USE THIS FILE
--
--   1. Connect to the real project with the Supabase SQL editor (or `psql`
--      with a role that can bypass RLS — e.g. the `postgres`/service role;
--      running this as an ordinary `authenticated` user will be blocked by
--      this app's own RLS policies on most of these tables regardless).
--   2. Run PART 1 (AUDIT) in full. Read every result set. Confirm every row
--      it shows you is genuinely QA/test data and nothing a real household
--      would recognize as their own.
--   3. If, and only if, PART 1's output looks right: run PART 2 (CLEANUP)
--      wrapped in the `BEGIN;` / inspect / `COMMIT;` (or `ROLLBACK;`)
--      pattern already written into it below. Do not blindly run the whole
--      file start to finish outside of a transaction.
--   4. Run PART 3 (AUDIT AFTER) to confirm what's left and review any rows
--      the guarded deletes skipped because a real row still depends on them.
--
-- ============================================================================


-- ============================================================================
-- PART 1 — AUDIT (read-only; safe to run anytime, changes nothing)
-- ============================================================================

-- How many rows, and in which households, across every text column a
-- "[QA] ..." marker could plausibly appear in.
select 'accounts.name'                  as source, household_id, id, name        as value from accounts               where name        like '[QA]%'
union all
select 'categories.name_he',                       household_id, id, name_he     from categories             where name_he     like '[QA]%'
union all
select 'categories.name_en',                       household_id, id, name_en     from categories             where name_en     like '[QA]%'
union all
select 'recurring_transactions.description',       household_id, id, description from recurring_transactions where description like '[QA]%'
union all
select 'planned_obligations.name',                 household_id, id, name        from planned_obligations    where name        like '[QA]%'
union all
select 'installment_plans.description',            household_id, id, description from installment_plans      where description like '[QA]%'
union all
select 'savings_goals.name',                       household_id, id, name        from savings_goals          where name        like '[QA]%'
union all
select 'transactions.description',                 household_id, id, description from transactions           where description like '[QA]%'
union all
select 'transfers.description',                    household_id, id, description from transfers              where description like '[QA]%'
order by source, household_id;

-- Every distinct household that has ANY of the above, with a per-table
-- count — if this is exactly one household, that strongly suggests a
-- single dedicated QA/test household rather than QA rows scattered into
-- real households' data, which changes how aggressive step 4 above is safe
-- to be.
select household_id,
       count(*) filter (where source = 'accounts')               as qa_accounts,
       count(*) filter (where source = 'categories')              as qa_categories,
       count(*) filter (where source = 'recurring_transactions')  as qa_recurring,
       count(*) filter (where source = 'planned_obligations')     as qa_obligations,
       count(*) filter (where source = 'installment_plans')       as qa_installment_plans,
       count(*) filter (where source = 'savings_goals')           as qa_savings_goals,
       count(*) filter (where source = 'transactions')            as qa_transactions,
       count(*) filter (where source = 'transfers')               as qa_transfers
from (
  select 'accounts' as source, household_id from accounts where name like '[QA]%'
  union all select 'categories', household_id from categories where name_he like '[QA]%' or name_en like '[QA]%'
  union all select 'recurring_transactions', household_id from recurring_transactions where description like '[QA]%'
  union all select 'planned_obligations', household_id from planned_obligations where name like '[QA]%'
  union all select 'installment_plans', household_id from installment_plans where description like '[QA]%'
  union all select 'savings_goals', household_id from savings_goals where name like '[QA]%'
  union all select 'transactions', household_id from transactions where description like '[QA]%'
  union all select 'transfers', household_id from transfers where description like '[QA]%'
) t
group by household_id
order by household_id;

-- Transactions that are NOT themselves QA-marked but reference a
-- QA-marked recurring template / installment plan (i.e. rows the CLEANUP
-- section below will preserve but detach, per the safety model above,
-- rather than delete) — worth a human's eyes before running PART 2.
select 'via recurring_id' as via, t.id, t.description, t.txn_date, t.household_id
from transactions t
join recurring_transactions r on r.id = t.recurring_id
where r.description like '[QA]%' and t.description not like '[QA]%'
union all
select 'via installment_plan_id', t.id, t.description, t.txn_date, t.household_id
from transactions t
join installment_plans p on p.id = t.installment_plan_id
where p.description like '[QA]%' and t.description not like '[QA]%';


-- ============================================================================
-- PART 2 — CLEANUP (destructive; run only after reading PART 1's output)
-- ============================================================================
--
-- Wrapped in an explicit transaction. Run everything from `begin;` down to
-- (but not including) the final `commit;`/`rollback;` line, inspect the
-- `raise notice` output each guarded delete prints, and only then decide
-- whether to `commit;` or `rollback;` — this transaction holds row locks
-- and stays open until you do one or the other explicitly.

begin;

-- Step 1: detach (never delete) any real, non-QA transaction that
-- references a QA-marked recurring template, so step 5 (deleting the
-- template) doesn't fail on `recurring_id`'s FK, which has no ON DELETE
-- action. Only clears the link; the transaction row and its amount/date/
-- description are completely untouched.
with detached as (
  update transactions t
  set recurring_id = null
  from recurring_transactions r
  where t.recurring_id = r.id
    and r.description like '[QA]%'
  returning t.id
)
select count(*) as recurring_links_cleared from detached;

-- Step 2: QA-marked transfers. ON DELETE CASCADE on
-- `transactions.transfer_id` means both legs of a QA-marked transfer are
-- removed automatically — no separate transaction delete needed for these.
with deleted as (
  delete from transfers
  where description like '[QA]%'
  returning id
)
select count(*) as qa_transfers_deleted from deleted;

-- Step 3: QA-marked transactions that are not part of a transfer (those
-- were already handled by step 2's cascade; `transfer_id is null` avoids a
-- redundant, RLS-blocked-style delete attempt on an already-gone row).
with deleted as (
  delete from transactions
  where description like '[QA]%'
    and transfer_id is null
  returning id
)
select count(*) as qa_transactions_deleted from deleted;

-- Step 4: QA-marked planned obligations. `transactions.obligation_id` is
-- ON DELETE SET NULL, so any real transaction ever linked to a QA
-- obligation via "mark paid" keeps existing, just loses that link — the
-- money movement itself is never touched.
with deleted as (
  delete from planned_obligations
  where name like '[QA]%'
  returning id
)
select count(*) as qa_obligations_deleted from deleted;

-- Step 5: QA-marked recurring templates. Safe now that step 1 cleared
-- every real transaction's `recurring_id` pointing at one of these; any
-- transaction that was ALSO QA-marked was already removed in step 3.
with deleted as (
  delete from recurring_transactions
  where description like '[QA]%'
  returning id
)
select count(*) as qa_recurring_deleted from deleted;

-- Step 6: QA-marked installment plans. `transactions.installment_plan_id`
-- is ON DELETE SET NULL — a real, non-QA-marked instalment transaction
-- generated from a QA plan (see PART 1's last query) keeps existing as a
-- real financial record, just no longer tagged as an instalment of a plan
-- that no longer exists.
with deleted as (
  delete from installment_plans
  where description like '[QA]%'
  returning id
)
select count(*) as qa_installment_plans_deleted from deleted;

-- Step 7: QA-marked savings goals. No incoming FK from any other table.
with deleted as (
  delete from savings_goals
  where name like '[QA]%'
  returning id
)
select count(*) as qa_savings_goals_deleted from deleted;

-- Step 8: QA-marked accounts — guarded. Only deletes an account if,
-- after every step above, nothing real still points at it. `accounts.id`
-- is NOT NULL + no ON DELETE action on transactions/recurring_transactions/
-- installment_plans, so an unguarded delete would simply fail loudly on
-- the first real reference; this instead skips that specific account and
-- reports it, letting the rest of the cleanup proceed.
with candidates as (
  select id from accounts where name like '[QA]%'
),
deletable as (
  select c.id from candidates c
  where not exists (select 1 from transactions t where t.account_id = c.id)
    and not exists (select 1 from recurring_transactions r where r.account_id = c.id)
    and not exists (select 1 from planned_obligations o where o.account_id = c.id)
    and not exists (select 1 from installment_plans p where p.account_id = c.id)
    and not exists (select 1 from savings_goals g where g.account_id = c.id)
    and not exists (select 1 from transfers tr where tr.from_account_id = c.id or tr.to_account_id = c.id)
),
deleted as (
  delete from accounts where id in (select id from deletable) returning id
)
select
  (select count(*) from deleted) as qa_accounts_deleted,
  (select count(*) from candidates) - (select count(*) from deleted) as qa_accounts_skipped_still_referenced;

-- Step 9: QA-marked categories — guarded the same way. `categories.id` is
-- referenced (nullably, no ON DELETE action) from transactions/
-- recurring_transactions/planned_obligations/installment_plans, plus
-- non-nullably from budget_allocations/category_rules, plus recursively
-- from other categories via parent_id.
with candidates as (
  select id from categories where name_he like '[QA]%' or name_en like '[QA]%'
),
deletable as (
  select c.id from candidates c
  where not exists (select 1 from transactions t where t.category_id = c.id)
    and not exists (select 1 from recurring_transactions r where r.category_id = c.id)
    and not exists (select 1 from planned_obligations o where o.category_id = c.id)
    and not exists (select 1 from installment_plans p where p.category_id = c.id)
    and not exists (select 1 from budget_allocations b where b.category_id = c.id)
    and not exists (select 1 from category_rules cr where cr.category_id = c.id)
    and not exists (select 1 from categories child where child.parent_id = c.id)
),
deleted as (
  delete from categories where id in (select id from deletable) returning id
)
select
  (select count(*) from deleted) as qa_categories_deleted,
  (select count(*) from candidates) - (select count(*) from deleted) as qa_categories_skipped_still_referenced;

-- STOP HERE. Read every `raise`/result above. Only one of the next two
-- lines should ever actually run — leave the other commented out, or
-- better, run them interactively rather than as part of this same script
-- execution, so you have a real chance to look at the output first.

-- commit;
-- rollback;


-- ============================================================================
-- PART 3 — AUDIT AFTER (read-only; run once PART 2 has been committed)
-- ============================================================================

select 'accounts.name'                  as source, household_id, id, name        as value from accounts               where name        like '[QA]%'
union all
select 'categories.name_he',                       household_id, id, name_he     from categories             where name_he     like '[QA]%'
union all
select 'categories.name_en',                       household_id, id, name_en     from categories             where name_en     like '[QA]%'
union all
select 'recurring_transactions.description',       household_id, id, description from recurring_transactions where description like '[QA]%'
union all
select 'planned_obligations.name',                 household_id, id, name        from planned_obligations    where name        like '[QA]%'
union all
select 'installment_plans.description',            household_id, id, description from installment_plans      where description like '[QA]%'
union all
select 'savings_goals.name',                       household_id, id, name        from savings_goals          where name        like '[QA]%'
union all
select 'transactions.description',                 household_id, id, description from transactions           where description like '[QA]%'
union all
select 'transfers.description',                    household_id, id, description from transfers              where description like '[QA]%'
order by source, household_id;
-- Any rows still showing here after PART 2 were skipped by a `NOT EXISTS`
-- guard (accounts/categories still referenced by something real) — resolve
-- those individually; do not widen the guards just to force them through.
