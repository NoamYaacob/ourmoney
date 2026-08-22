// "Next 30 days" financial commitments summary — a unified, deterministic
// view over the SAME canonical event sources Safe-to-Spend already reserves
// against (planned_obligations, recurring_transactions, installment_plans),
// plus one additional source Safe-to-Spend does not surface as its own line
// item: a credit card's current open billing cycle. Deliberately computes
// NOTHING itself that another engine doesn't already own — it only calls
// the existing forecastRecurringOccurrences/forecastInstallmentOccurrences/
// getCurrentBillingCycleRange/computeCurrentCycleSpendAgorot primitives and
// re-shapes their output for display, the same "no second parallel engine"
// discipline lib/engines/alerts/buildFinancialAlerts.ts already documents.
//
// Double-count guard: inherited entirely from the reused primitives'
// existing guarantees — forecastRecurringOccurrences starts from each
// template's own next_due_date (never "today"), forecastInstallmentOccurrences
// starts from materializedCount + 1, and an obligation only appears here
// while its own status is still 'upcoming' (flipped to 'completed' once
// marked paid — see app/(app)/obligations/[id].tsx's mark-paid flow). None
// of these can ever also already exist as a posted transaction; see each
// reused engine's own header for the full reasoning. The credit-card cycle
// line item is different in kind: it reports money ALREADY SPENT on the
// card this cycle that has not yet been settled by a statement-payment
// transfer (ADR-037) — not a future purchase forecast, so there is no
// "double count a future occurrence" risk for it at all.
//
// Shared/personal split: obligations/recurring templates/installment plans
// each carry a single household-wide is_shared flag, so their own
// sharedAgorot/personalAgorot split is a straight either/or. A credit
// card's current-cycle spend is not single-owner — it is the sum of many
// individual transactions, each with its own is_shared — so its split is a
// real per-transaction sum, reusing computeCurrentCycleSpendAgorot twice
// (once over all transactions, once over only the shared ones) rather than
// a third, bespoke summation.

import {
  forecastRecurringOccurrences,
  type RecurringForecastTemplate,
} from '../cashflow/forecastRecurringOccurrences'
import {
  forecastInstallmentOccurrences,
  type InstallmentPlanForecastTemplate,
} from '../cashflow/forecastInstallmentOccurrences'
import {
  computeCurrentCycleSpendAgorot,
  getCurrentBillingCycleRange,
  type CycleSpendTransaction,
} from '@/features/accounts/lib/creditCardCycle'
import type { PlannedObligationStatus } from '@/types/app'

export type UpcomingCommitmentSource = 'obligation' | 'recurring' | 'installment' | 'credit_card_cycle'

export interface UpcomingCommitment {
  // Deterministic, derived from source + identity — never a persisted row
  // id (this list is never itself stored), same convention as
  // FinancialAlert.id.
  id: string
  source: UpcomingCommitmentSource
  // The underlying row's own id — for navigation to its detail screen.
  // Deliberately separate from `id` above (a recurring/installment
  // occurrence's `id` also encodes its own date/index, since one template
  // can appear as several distinct list rows within the horizon; sourceId
  // always identifies the one underlying obligation/template/plan/account).
  sourceId: string
  description: string
  // Always a positive magnitude — this is a list of upcoming/outstanding
  // claims on the household's cash, never a signed transaction amount.
  amountAgorot: number
  // sharedAgorot + personalAgorot === amountAgorot, always.
  sharedAgorot: number
  personalAgorot: number
  date: string
  categoryId: string | null
  accountId: string | null
}

export interface CommitmentObligationInput {
  id: string
  name: string
  amountAgorot: number
  dueDate: string
  status: PlannedObligationStatus
  categoryId: string | null
  accountId: string | null
  isShared: boolean
}

export interface CommitmentRecurringTemplate extends RecurringForecastTemplate {
  isShared: boolean
}

export interface CommitmentInstallmentTemplate extends InstallmentPlanForecastTemplate {
  isShared: boolean
}

export interface CommitmentCreditCardTransaction extends CycleSpendTransaction {
  isShared: boolean
}

export interface CommitmentCreditCardAccountInput {
  accountId: string
  accountName: string
  billingCycleDay: number
  transactions: readonly CommitmentCreditCardTransaction[]
}

export interface BuildUpcomingCommitmentsInput {
  today: string
  horizonEnd: string
  obligations: readonly CommitmentObligationInput[]
  recurringTemplates: readonly CommitmentRecurringTemplate[]
  installmentPlans: readonly CommitmentInstallmentTemplate[]
  creditCardAccounts: readonly CommitmentCreditCardAccountInput[]
}

function sharedSplit(amountAgorot: number, isShared: boolean): { sharedAgorot: number; personalAgorot: number } {
  return isShared ? { sharedAgorot: amountAgorot, personalAgorot: 0 } : { sharedAgorot: 0, personalAgorot: amountAgorot }
}

export function buildUpcomingCommitments(input: BuildUpcomingCommitmentsInput): UpcomingCommitment[] {
  const items: UpcomingCommitment[] = []

  // Same filter calculateSafeToSpend.ts uses (status === 'upcoming' &&
  // dueDate <= horizonEnd), including an overdue-but-unpaid obligation —
  // money still owed is exactly as much an upcoming claim on cash as money
  // due next week (horizonRange.ts's own header documents this precedent).
  for (const obligation of input.obligations) {
    if (obligation.status !== 'upcoming' || obligation.dueDate > input.horizonEnd) continue
    items.push({
      id: `obligation:${obligation.id}`,
      source: 'obligation',
      sourceId: obligation.id,
      description: obligation.name,
      amountAgorot: obligation.amountAgorot,
      ...sharedSplit(obligation.amountAgorot, obligation.isShared),
      date: obligation.dueDate,
      categoryId: obligation.categoryId,
      accountId: obligation.accountId,
    })
  }

  const recurringIsSharedById = new Map(input.recurringTemplates.map((t) => [t.id, t.isShared]))
  for (const occurrence of forecastRecurringOccurrences(input.recurringTemplates, input.horizonEnd)) {
    // Income occurrences are not a "commitment" to spend — this widget
    // answers "what's coming out," matching Safe-to-Spend's own
    // expense-only filter for the same source.
    if (occurrence.amountAgorot >= 0) continue
    const amountAgorot = -occurrence.amountAgorot
    items.push({
      id: `recurring:${occurrence.recurringId}:${occurrence.date}`,
      source: 'recurring',
      sourceId: occurrence.recurringId,
      description: occurrence.description,
      amountAgorot,
      ...sharedSplit(amountAgorot, recurringIsSharedById.get(occurrence.recurringId) ?? false),
      date: occurrence.date,
      categoryId: occurrence.categoryId,
      accountId: occurrence.accountId,
    })
  }

  const installmentIsSharedById = new Map(input.installmentPlans.map((p) => [p.id, p.isShared]))
  for (const occurrence of forecastInstallmentOccurrences(input.installmentPlans, input.horizonEnd)) {
    const amountAgorot = -occurrence.amountAgorot // always negative on the source occurrence (always an expense)
    items.push({
      id: `installment:${occurrence.installmentPlanId}:${occurrence.installmentIndex}`,
      source: 'installment',
      sourceId: occurrence.installmentPlanId,
      description: occurrence.description,
      amountAgorot,
      ...sharedSplit(amountAgorot, installmentIsSharedById.get(occurrence.installmentPlanId) ?? false),
      date: occurrence.date,
      categoryId: occurrence.categoryId,
      accountId: occurrence.accountId,
    })
  }

  for (const account of input.creditCardAccounts) {
    const range = getCurrentBillingCycleRange(account.billingCycleDay, input.today)
    const amountAgorot = computeCurrentCycleSpendAgorot(account.transactions, range)
    if (amountAgorot <= 0) continue
    const sharedAgorot = computeCurrentCycleSpendAgorot(
      account.transactions.filter((t) => t.isShared),
      range
    )
    items.push({
      id: `credit_card_cycle:${account.accountId}`,
      source: 'credit_card_cycle',
      sourceId: account.accountId,
      description: account.accountName,
      amountAgorot,
      sharedAgorot,
      personalAgorot: amountAgorot - sharedAgorot,
      // The cycle's own closing date — when this spend actually becomes a
      // statement debit — not `today`. Deliberately shown even if it falls
      // beyond horizonEnd: the spend itself already happened and is
      // already a real, non-extrapolated claim on the household's cash
      // regardless of exactly which day the statement closes.
      date: range.end,
      categoryId: null,
      accountId: account.accountId,
    })
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
