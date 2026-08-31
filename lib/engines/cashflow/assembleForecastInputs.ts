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

import type { Account, InstallmentPlan, PlannedObligation, RecurringTransaction } from '@/types/app'
import { sumEligibleCashAgorot } from './eligibleCashAccounts'
import type { PlannedObligationForecastInput } from './calculateSafeToSpend'
import type { RecurringForecastTemplate } from './forecastRecurringOccurrences'
import type { InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'

export interface ForecastEngineSources {
  accounts: readonly Account[]
  balances: Readonly<Record<string, number>>
  obligations: readonly PlannedObligation[]
  recurringTransactions: readonly RecurringTransaction[]
  installmentPlans: readonly InstallmentPlan[]
  materializedCounts: Readonly<Record<string, number>>
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
}

export function assembleForecastInputs(sources: ForecastEngineSources): ForecastEngineInputs {
  return {
    availableCashAgorot: sumEligibleCashAgorot(sources.accounts, sources.balances),
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
      materializedCount: sources.materializedCounts[p.id] ?? 0,
      categoryId: p.category_id,
      accountId: p.account_id,
    })),
  }
}
