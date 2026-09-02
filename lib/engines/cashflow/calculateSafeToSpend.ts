// The Safe-to-Spend V1 engine — deterministic, no AI, no network (CLAUDE.md
// § Deterministic Financial Logic vs. AI / ADR-012). Combines the things
// the household already has:
//
//   available cash        (eligible cash accounts' computed balance)
//   − upcoming obligations (planned_obligations, status = 'upcoming', due
//                            within the horizon)
//   − upcoming recurring   (active, expense-only recurring_transactions
//                            charges, forecasted within the horizon)
//   − upcoming instalments (not-yet-materialized installment_plans charges,
//                            forecasted within the horizon — migration 016,
//                            ADR-037)
//   − credit-card cycles   (each credit card's own posted, not-yet-settled
//                            CURRENT billing-cycle spend — RRR P1 finding #7,
//                            creditCardCycleReservation.ts)
//   = safe to spend
//
// Instalments and credit-card cycle spend are both reserved here even
// though the credit-card account itself is never in availableCashAgorot
// (eligibleCashAccounts.ts excludes 'credit_card'): the charge lands on the
// card today, but the household's own cash eventually settles that
// statement via an ordinary transfer (ADR-037's settlement-as-transfer
// decision). Not reserving it would let Safe-to-Spend ignore a real,
// already-committed future claim on cash purely because of which account
// type happened to record it — this used to be true only for a not-yet-
// materialized instalment charge; an ordinary posted card purchase this
// cycle is exactly as real a claim and now gets the same treatment.
//
// Deliberately excludes budget-remaining from the formula. Subtracting both
// a specific planned obligation/recurring charge AND the full remaining
// monthly budget for the same category would massively over-reserve money
// — there is no reliable way to prove a given obligation/recurring charge
// isn't already the thing consuming that budget category's remaining
// amount. Budget remaining is a separate, month-scoped planning signal
// (features/budgets/hooks/useBudgetProgress.ts); Safe-to-Spend V1 does not
// touch it.
//
// Known V1 limitation, documented rather than "solved" with a heuristic:
// planned_obligations and recurring_transactions have no shared identity
// signal (unlike transactions.recurring_id, which ties a generated row back
// to its exact template). A household that enters the same real bill in
// both tables (e.g. ארנונה as both a recurring template and a one-time
// obligation) will see it reserved twice. No fuzzy/heuristic cross-table
// matching is attempted here — same "no fuzzy matching" discipline as
// features/categories/lib/matchRule.ts and features/recurring/lib/
// priceIncreaseDetection.ts's identity grouping.
//
// Also deliberate, not a bug: an obligation or recurring template whose own
// account_id points at a non-cash account (a credit card, a savings
// account, or none at all) is still reserved against the single pooled
// availableCashAgorot figure, exactly like every other item. V1 is one
// household-level cash pool, not a per-account ledger — the same
// simplification that makes this ONE number instead of per-member ones.
//
// is_shared is NOT used to filter obligations or recurring templates here.
// CLAUDE.md is explicit that is_shared is budget-attribution only, never a
// relevance/visibility flag — a personal (is_shared = false) obligation is
// exactly as real a claim on the household's shared bank accounts as a
// shared one. Safe-to-Spend V1 is therefore ONE household-level number,
// not split by member — see this engine's own tests and the milestone's
// scope guard against expanding into a per-member ("שלי") figure.

import { forecastRecurringOccurrences, type RecurringForecastTemplate } from './forecastRecurringOccurrences'
import { forecastInstallmentOccurrences, type InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'
import type { CreditCardCycleReservationItem } from './creditCardCycleReservation'
import type { PlannedObligationStatus } from '@/types/app'

export interface PlannedObligationForecastInput {
  id: string
  name: string
  // Always positive, as stored on planned_obligations.amount_agorot.
  amountAgorot: number
  dueDate: string
  status: PlannedObligationStatus
  categoryId: string | null
  accountId: string | null
}

export type SafeToSpendItemSource = 'obligation' | 'recurring' | 'installment' | 'credit_card_cycle'

export interface SafeToSpendItem {
  sourceType: SafeToSpendItemSource
  sourceId: string
  description: string
  amountAgorot: number
  date: string
  categoryId: string | null
  accountId: string | null
}

export interface SafeToSpendInput {
  availableCashAgorot: number
  obligations: readonly PlannedObligationForecastInput[]
  recurringTemplates: readonly RecurringForecastTemplate[]
  installmentPlans: readonly InstallmentPlanForecastTemplate[]
  // RRR P1 finding #7 — already-resolved reservation items (one per credit
  // card with posted spend in its current, still-open billing cycle), built
  // by computeCreditCardCycleReservations (creditCardCycleReservation.ts)
  // via assembleForecastInputs.ts. Passed in pre-computed, the same shape
  // `obligations` already is — this engine sums/dates them, it never
  // re-derives a card's cycle boundaries or spend total itself (no second
  // financial calculation).
  creditCardCycleItems: readonly CreditCardCycleReservationItem[]
  horizonEnd: string
}

export interface SafeToSpendResult {
  availableCashAgorot: number
  plannedObligationsAgorot: number
  recurringAgorot: number
  installmentsAgorot: number
  // RRR P1 finding #7: the sum of every credit card's posted, not-yet-
  // settled CURRENT cycle spend — reserved for the same reason an
  // instalment's forecasted future charge already is (see this file's own
  // header comment): it is a real, already-committed future claim on cash,
  // regardless of which account type happened to record it.
  creditCardCycleAgorot: number
  reservedAgorot: number
  safeToSpendAgorot: number
  // 0 unless safeToSpendAgorot is negative, in which case its positive
  // magnitude — surfaced explicitly rather than shown as a confusing
  // negative "spendable" figure (this milestone's own UI requirement).
  shortfallAgorot: number
  // Sorted by date ascending, then sourceId for a stable tie-break.
  items: SafeToSpendItem[]
}

function sumAgorot(items: readonly { amountAgorot: number }[]): number {
  return items.reduce((sum, item) => sum + item.amountAgorot, 0)
}

export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const obligationItems: SafeToSpendItem[] = input.obligations
    .filter((o) => o.status === 'upcoming' && o.dueDate <= input.horizonEnd)
    .map((o) => ({
      sourceType: 'obligation',
      sourceId: o.id,
      description: o.name,
      amountAgorot: o.amountAgorot,
      date: o.dueDate,
      categoryId: o.categoryId,
      accountId: o.accountId,
    }))

  // forecastRecurringOccurrences is a general-purpose primitive that
  // forecasts every active template regardless of sign (broadened to
  // support the cash-flow forecast engine's need for both income and
  // expense occurrences) — Safe-to-Spend is a reservation-only formula, so
  // it explicitly keeps only expense-signed occurrences here and negates to
  // its own always-positive "amount reserved" contract, exactly as before
  // this primitive was broadened.
  const recurringItems: SafeToSpendItem[] = forecastRecurringOccurrences(input.recurringTemplates, input.horizonEnd)
    .filter((occurrence) => occurrence.amountAgorot < 0)
    .map((occurrence) => ({
      sourceType: 'recurring',
      sourceId: occurrence.recurringId,
      description: occurrence.description,
      amountAgorot: -occurrence.amountAgorot,
      date: occurrence.date,
      categoryId: occurrence.categoryId,
      accountId: occurrence.accountId,
    }))

  // forecastInstallmentOccurrences reports every amount as negative (always
  // an expense, no income concept — see its own header), same reason the
  // recurring branch above negates only occurrences it filtered to
  // amountAgorot < 0.
  const installmentItems: SafeToSpendItem[] = forecastInstallmentOccurrences(input.installmentPlans, input.horizonEnd).map(
    (occurrence) => ({
      sourceType: 'installment',
      sourceId: occurrence.installmentPlanId,
      description: occurrence.description,
      amountAgorot: -occurrence.amountAgorot,
      date: occurrence.date,
      categoryId: occurrence.categoryId,
      accountId: occurrence.accountId,
    })
  )

  // Already a resolved, positive-magnitude reservation per card — no
  // forecasting needed here, unlike obligations/recurring/instalments,
  // since a current, still-open billing cycle has exactly one reservation,
  // not a recurring series of future occurrences.
  const creditCardCycleItemsResult: SafeToSpendItem[] = input.creditCardCycleItems.map((item) => ({
    sourceType: 'credit_card_cycle',
    sourceId: item.accountId,
    description: item.description,
    amountAgorot: item.amountAgorot,
    date: item.date,
    categoryId: null,
    accountId: item.accountId,
  }))

  const plannedObligationsAgorot = sumAgorot(obligationItems)
  const recurringAgorot = sumAgorot(recurringItems)
  const installmentsAgorot = sumAgorot(installmentItems)
  const creditCardCycleAgorot = sumAgorot(creditCardCycleItemsResult)
  const reservedAgorot = plannedObligationsAgorot + recurringAgorot + installmentsAgorot + creditCardCycleAgorot
  const safeToSpendAgorot = input.availableCashAgorot - reservedAgorot

  const items = [...obligationItems, ...recurringItems, ...installmentItems, ...creditCardCycleItemsResult].sort(
    (a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId)
  )

  return {
    availableCashAgorot: input.availableCashAgorot,
    plannedObligationsAgorot,
    recurringAgorot,
    installmentsAgorot,
    creditCardCycleAgorot,
    reservedAgorot,
    safeToSpendAgorot,
    shortfallAgorot: safeToSpendAgorot < 0 ? -safeToSpendAgorot : 0,
    items,
  }
}
