// Pure adapter: the ONE place the shared row shape (accounts + computed
// balances + planned obligations + recurring templates + installment plans
// + materialized counts) is mapped from each source hook's own snake_case
// Supabase row shape into the camelCase input shape calculateSafeToSpend
// and calculateCashFlowForecast both consume.
//
// Extracted from useSafeToSpend.ts/useCashFlowForecast.ts, which previously
// each inlined an identical copy of this mapping (CP8F). Kept here — not as
// a third inline copy in the new Impact Check adapter — per CLAUDE.md's "no
// duplicated financial logic" discipline: a schema-shape change now touches
// exactly one file instead of three that could silently drift out of sync.
// No new calculation happens here — every actual number crunching still
// lives only inside the two engine files this feeds.

import type { Account, InstallmentPlan, PlannedObligation, RecurringTransaction, Transaction } from '@/types/app'
import { sumEligibleCashAgorot } from './eligibleCashAccounts'
import { computeCreditCardCycleReservations, type CreditCardCycleReservationItem } from './creditCardCycleReservation'
import type { PlannedObligationForecastInput } from './calculateSafeToSpend'
import type { RecurringForecastTemplate } from './forecastRecurringOccurrences'
import type { InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'

export interface ForecastEngineSources {
  accounts: readonly Account[]
  balances: Readonly<Record<string, number>>
  obligations: readonly PlannedObligation[]
  recurringTransactions: readonly RecurringTransaction[]
  installmentPlans: readonly InstallmentPlan[]
  // MAX(installment_index) per plan — NOT a row count. See
  // forecastInstallmentOccurrences.ts's module header (RRR §14 P0-1) for why
  // a row count silently diverges from the true next-forecast index once any
  // materialized instalment has been deleted. Callers should derive this via
  // useInstallmentMaterializedCounts's maxMaterializedIndices, never its
  // materializedCounts (which stays a row count, for display only).
  maxMaterializedIndices: Readonly<Record<string, number>>
  // RRR P1 finding #7 — recent transactions, used ONLY to compute each
  // credit card's own current (still-open) billing-cycle spend
  // (creditCardCycleReservation.ts). Callers only need a bounded recent
  // window (any possible cycle start is at most ~31 days back), not the
  // household's full transaction history — see each hook's own fetch for
  // the exact bound used.
  transactions: readonly Pick<Transaction, 'account_id' | 'amount_agorot' | 'txn_date' | 'transfer_id' | 'is_excluded'>[]
}

// The fields calculateSafeToSpend's SafeToSpendInput and
// calculateCashFlowForecast's CashFlowForecastInput share verbatim — each
// caller adds its own remaining field (horizonEnd, or
// startingBalanceAgorot/startDate/endDate) on top of this.
export interface ForecastEngineInputs {
  availableCashAgorot: number
  obligations: PlannedObligationForecastInput[]
  recurringTemplates: RecurringForecastTemplate[]
  installmentPlans: InstallmentPlanForecastTemplate[]
  creditCardCycleItems: CreditCardCycleReservationItem[]
}

// `today` is a second, explicit argument (not folded into `sources`) for
// the same reason horizonEnd/startDate are passed alongside `...engineInputs`
// at every call site rather than being a "data source": it is a "when," not
// household data, and keeping it out of ForecastEngineSources means this
// function never reaches for the clock itself (CLAUDE.md's deterministic-
// engine discipline — every date comparison here is over an already-known
// string the caller supplied, same as computeFinancialPulse.ts's).
export function assembleForecastInputs(sources: ForecastEngineSources, today: string): ForecastEngineInputs {
  return {
    availableCashAgorot: sumEligibleCashAgorot(sources.accounts, sources.balances),
    creditCardCycleItems: computeCreditCardCycleReservations(sources.accounts, sources.transactions, today),
    obligations: sources.obligations.map((o) => ({
      id: o.id,
      name: o.name,
      amountAgorot: o.amount_agorot,
      dueDate: o.due_date,
      status: o.status,
      categoryId: o.category_id,
      accountId: o.account_id,
    })),
    recurringTemplates: sources.recurringTransactions.map((r) => ({
      id: r.id,
      description: r.description,
      amountAgorot: r.amount_agorot,
      frequency: r.frequency,
      dayOfMonth: r.day_of_month,
      nextDueDate: r.next_due_date,
      isActive: r.is_active,
      categoryId: r.category_id,
      accountId: r.account_id,
    })),
    installmentPlans: sources.installmentPlans.map((p) => ({
      id: p.id,
      description: p.description,
      totalAgorot: p.total_agorot,
      installmentCount: p.installment_count,
      monthlyAgorot: p.monthly_agorot,
      firstChargeDate: p.first_charge_date,
      lastMaterializedIndex: sources.maxMaterializedIndices[p.id] ?? 0,
      categoryId: p.category_id,
      accountId: p.account_id,
    })),
  }
}
