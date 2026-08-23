// Supabase-aware composition layer only — every actual computation happens
// in lib/engines/cashflow/ (pure, unit-tested, no network). This hook's only
// job is: fetch the household's accounts/balances/obligations/recurring
// templates via the existing, unmodified hooks (no new Supabase query is
// added here), adapt each row's snake_case shape to the engine's input
// shape, and call the engine.

import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { sumEligibleCashAgorot } from '@/lib/engines/cashflow/eligibleCashAccounts'
import { getHorizonRange, type HorizonKind, type HorizonRange } from '@/lib/engines/cashflow/horizonRange'
import { calculateSafeToSpend, type SafeToSpendResult } from '@/lib/engines/cashflow/calculateSafeToSpend'

export interface UseSafeToSpendResult {
  result: SafeToSpendResult
  horizon: HorizonRange
  isLoading: boolean
  error: Error | null
}

export function useSafeToSpend(
  householdId: string | null | undefined,
  horizonKind: HorizonKind
): UseSafeToSpendResult {
  const { accounts, isLoading: isAccountsLoading, error: accountsError } = useAccounts(householdId)
  const { balances, isLoading: isBalancesLoading, error: balancesError } = useAccountBalances(householdId)
  const { obligations, isLoading: isObligationsLoading, error: obligationsError } = usePlannedObligations(householdId)
  const {
    recurringTransactions,
    isLoading: isRecurringLoading,
    error: recurringError,
  } = useRecurringTransactions(householdId)
  const { plans: installmentPlans, isLoading: isInstallmentPlansLoading, error: installmentPlansError } =
    useInstallmentPlans(householdId)
  const {
    materializedCounts,
    isLoading: isMaterializedCountsLoading,
    error: materializedCountsError,
  } = useInstallmentMaterializedCounts(householdId)

  const horizon = getHorizonRange(horizonKind)
  const availableCashAgorot = sumEligibleCashAgorot(accounts, balances)

  const result = calculateSafeToSpend({
    availableCashAgorot,
    obligations: obligations.map((o) => ({
      id: o.id,
      name: o.name,
      amountAgorot: o.amount_agorot,
      dueDate: o.due_date,
      status: o.status,
      categoryId: o.category_id,
      accountId: o.account_id,
    })),
    recurringTemplates: recurringTransactions.map((r) => ({
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
    installmentPlans: installmentPlans.map((p) => ({
      id: p.id,
      description: p.description,
      totalAgorot: p.total_agorot,
      installmentCount: p.installment_count,
      monthlyAgorot: p.monthly_agorot,
      firstChargeDate: p.first_charge_date,
      materializedCount: materializedCounts[p.id] ?? 0,
      categoryId: p.category_id,
      accountId: p.account_id,
    })),
    horizonEnd: horizon.end,
  })

  return {
    result,
    horizon,
    isLoading:
      isAccountsLoading ||
      isBalancesLoading ||
      isObligationsLoading ||
      isRecurringLoading ||
      isInstallmentPlansLoading ||
      isMaterializedCountsLoading,
    error: accountsError ?? balancesError ?? obligationsError ?? recurringError ?? installmentPlansError ?? materializedCountsError,
  }
}
