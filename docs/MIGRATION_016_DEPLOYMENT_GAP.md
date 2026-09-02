# Migration 016 (and possibly 012–015) never applied to the real "OurMoney Preview" project

## What the real diagnostics proved

Captured from the real deployed Vercel preview via `lib/diagnostics/queryDiagnostics.ts`
(`?diag=1` → `/diagnostics`), same authenticated household/session throughout:

| Source | Result |
|---|---|
| `useInstallmentPlans` → `installment_plans` SELECT | **HTTP 404, code `PGRST205`**: "Could not find the table 'public.installment_plans' in the schema cache" |
| `useInstallmentMaterializedCounts` → `transactions` SELECT | **HTTP 400, code `42703`**: "column transactions.installment_plan_id does not exist" |
| `useAccounts`, `useAccountBalances`, `usePlannedObligations`, `useRecurringTransactions`, `useCategories` | OK |

`hadUserId: true`, `hadHouseholdId: true` on every request. This rules out auth/session/RLS-identity
problems — the failures are specifically "this table/column does not exist in this Postgres
database," which is exactly what PostgREST's error codes say (`PGRST205` = table absent from its
schema cache; `42703` = the raw Postgres "column does not exist" error).

## Complete dependency chain for the installment-plan feature

A repo-wide `grep -l installment supabase/migrations/*.sql` finds exactly one migration that
creates any installment-related schema: **`016_installment_plans.sql`**. It introduces, in one
file (RLS travels with its table, per this repo's own convention):

- `accounts.billing_cycle_day` (nullable column + CHECK)
- `installment_plans` table, its indexes, RLS (`installment_plans_select`/`_insert`), grants
- `transactions.installment_plan_id` / `transactions.installment_index` (nullable columns, FK,
  index, CHECK)
- `update_installment_plan()`, `delete_installment_plan()`,
  `generate_installment_transactions()` (all `SECURITY DEFINER`, all `REVOKE ALL ... GRANT
  EXECUTE TO authenticated`)
- Re-created `leave_household()` / `delete_own_account()` (adds one `installment_plans.created_by
  = NULL` statement each, matching migration 008's precedent for `transfers.created_by`)

**016 cannot be applied standalone.** Its own `transactions_insert`/`transactions_update` RLS
policies (`DROP POLICY` + `CREATE POLICY`, lines 214–277) reference `obligation_id IS NULL` —
a column that does not exist until **`012_obligation_transaction_link.sql`** adds it. Applying
016 against a database that only has 001–011 would fail with the same `42703` on
`transactions.obligation_id` this investigation already found on `installment_plan_id`.

The full, ordered, must-apply-together chain is therefore **012 → 013 → 014 → 015 → 016**:

| Migration | What it changes | Destructive? |
|---|---|---|
| 012 `obligation_transaction_link` | `transactions.obligation_id` (nullable FK), re-creates `transactions_insert`/`_update` policies, `complete_planned_obligation()`, `set_planned_obligation_status()` | No — additive column, policy re-creation doesn't touch data |
| 013 `loan_mortgage_account_types` | Drops+re-creates `accounts_type_check` to add `'loan'`/`'mortgage'` to the allowed set | No — new CHECK is a strict superset of the old one; any row valid under the old constraint is automatically valid under the new one |
| 014 `israeli_category_additions` | One `INSERT INTO categories` (new system categories) | No — insert-only, no existing row touched |
| 015 `savings_goal_progress_source` | `savings_goals.progress_source` (`NOT NULL DEFAULT 'manual'`, backfills existing rows in the same `ALTER TABLE`), a CHECK, `update_savings_goal()`/`update_savings_goal_progress()` | No — the `DEFAULT` clause backfills every existing row atomically |
| 016 `installment_plans` | See above | No — new table, nullable FK columns, `ON DELETE SET NULL` everywhere a plan/instalment could be removed |

No `DROP TABLE`, no `DELETE`, no data rewrite, no non-nullable column added without a safe
default, anywhere in 012–016. Every FK from `transactions` into a 012–016 object
(`obligation_id`, `installment_plan_id`) is nullable with `ON DELETE SET NULL` — deleting a
referenced row detaches it, never deletes the transaction.

`types/database.ts` already contains `installment_plans`, `accounts.billing_cycle_day`,
`transactions.installment_plan_id`/`installment_index`, and the matching FK metadata — it was
generated against a schema that already includes 016. **No type regeneration is needed once the
live database catches up; the mismatch is entirely on the database side, not the repo/types
side.**

## Why this happened — evidence, not speculation

This repo's own CI history explains the mechanism directly:

- `.github/workflows/migration-005-preview-validation.yml`'s header (dated 2026-08-13) documents
  that the real hosted project (display name confirmed via the Management API as **"OurMoney
  Preview."**, ref `safxtriacputgmpsdgkm`) had a `supabase_migrations.schema_migrations`
  bookkeeping table that didn't match this repo's migration filenames at all — so migration 005
  was applied by hand, directly via `psql`, deliberately bypassing `supabase db push` to avoid it
  trying to blindly re-apply 001–004.
- `.github/workflows/migration-history-reconciliation.yml`'s header states the project's
  migration history "was reconciled on 2026-08-18," and its own check only asserts **migrations
  001–011** are aligned — it does not check 012 or later, and it is explicitly read-only
  (`db push --dry-run` only, "this workflow never performs a real database push").
- `migration-007-db-validation.yml` and `migration-012-db-validation.yml` (the CI gates for those
  two migrations) both run against a **disposable local Supabase Docker stack**, explicitly never
  touching the hosted project ("no hosted project touched").

**Conclusion: there is no automated pipeline anywhere in this repository that applies migrations
to the real "OurMoney Preview" project.** Every real application to that project has been a
manual, deliberate, one-off human action (005's direct-psql apply; whatever produced the
2026-08-18 reconciliation through 011). Migrations 012–016 postdate that reconciliation, and
nothing in the repo's history shows any of them were ever applied to that project the same way.
Combined with the direct 404/42703 evidence for 016 specifically, the best-supported conclusion
is: **migrations 012–016 were written and committed, but the manual "apply to OurMoney Preview"
step was never performed for them.** This is "migration never applied," not a schema-drift,
wrong-project, or ordering bug — there is no evidence of the schema having been modified after
being applied, and the project identity check in 005's workflow confirms it's the same "OurMoney
Preview." project throughout.

This environment has no Supabase MCP tools, no `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`,
and no way to run `supabase link`/`db push`/`psql` against the real project — confirmed by
directly checking for these this session. **Nothing below has been applied. This is a report and
a prepared, reviewed procedure, not an executed fix.**

## How to apply it (pick one)

### Option A — `supabase db push` (preferred, now that 001–011 are reconciled)

```bash
supabase link --project-ref safxtriacputgmpsdgkm
supabase migration list                 # confirm 001–011 show as applied, 012–016 as pending
supabase db push --dry-run              # confirm it proposes ONLY 012, 013, 014, 015, 016 —
                                         # if it proposes touching 001–011 too, stop and use Option B
supabase db push                        # applies 012–016 in order, records them in
                                         # supabase_migrations.schema_migrations correctly
```

### Option B — direct `psql`, one migration at a time (this repo's own precedent from 005)

If `db push --dry-run` shows anything unexpected touching 001–011, apply each file directly and
skip the bookkeeping table for now (matching how 005 was applied):

```bash
for f in 012_obligation_transaction_link 013_loan_mortgage_account_types \
         014_israeli_category_additions 015_savings_goal_progress_source \
         016_installment_plans; do
  psql "$SUPABASE_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -1 -f "supabase/migrations/${f}.sql"
done
```

Each file runs in its own single transaction (`-1`); if any statement fails, that whole file
rolls back and nothing partial is left behind. Run them **in this exact order** — 016 will fail
on `obligation_id IS NULL` if 012 hasn't landed first.

## After applying — what to verify (real preview, not local)

1. `/dashboard?diag=1` once, then `/diagnostics` — `useInstallmentPlans` and
   `useInstallmentMaterializedCounts` should both show `OK`, not `FAIL`.
2. Cash Flow (`/cash-flow`) renders real content, not the blank/error state.
3. Home's "מה מגיע" stops oscillating into the partial-data banner for this reason specifically
   (other transient causes, if any, are a separate question).
4. Credit & Payments (`/installments`) loads.
5. Direct navigation to `/dashboard`, `/cash-flow`, `/installments`, `/diagnostics` still works
   (the separate Vercel `rewrites` fix from the previous pass).

None of this has been verified against the real environment from here — this environment has no
access to confirm it. Diagnostics stay in place (`lib/diagnostics/queryDiagnostics.ts`,
`app/(app)/diagnostics/index.tsx`) until this is confirmed on the real preview.
