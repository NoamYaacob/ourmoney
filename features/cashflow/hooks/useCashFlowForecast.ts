// Supabase-aware composition layer only — same shape as useSafeToSpend.ts,
// reusing the exact same six hooks (same TanStack Query keys, so calling
// both this hook and useSafeToSpend on one screen never issues a duplicate
// network request — they share the same cache entries). All computation
// happens in lib/engines/cashflow/calculateCashFlowForecast.ts.

import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { assembleForecastInputs } from '@/lib/engines/cashflow/assembleForecastInputs'
import { getDayRangeHorizon, type DayRangeHorizon } from '@/lib/engines/cashflow/horizonRange'
import { calculateCashFlowForecast, type CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

export interface UseCashFlowForecastResult {
  result: CashFlowForecastResult
  horizon: DayRangeHorizon
  isLoading: boolean
  error: Error | null
  // See useSafeToSpend.ts's identical field for the full rationale: `result`
  // is always fully computed from each source's own defaulted data, so it
  // can never distinguish "nothing has loaded yet" from "loaded, and
  // happens to be all zeros." True only once every one of the six composed
  // sources has resolved with data at least once; stays true through a
  // later background refetch failure.
  hasData: boolean
  refetch: () => void
}

export function useCashFlowForecast(
  householdId: string | null | undefined,
  horizonDays: number
): UseCashFlowForecastResult {
  const {
    accounts,
    isLoading: isAccountsLoading,
    error: accountsError,
    hasData: hasAccountsData,
    refetch: refetchAccounts,
  } = useAccounts(householdId)
  const {
    balances,
    isLoading: isBalancesLoading,
    error: balancesError,
    hasData: hasBalancesData,
    refetch: refetchBalances,
  } = useAccountBalances(householdId)
  const {
    obligations,
    isLoading: isObligationsLoading,
    error: obligationsError,
    hasData: hasObligationsData,
    refetch: refetchObligations,
  } = usePlannedObligations(householdId)
  const {
    recurringTransactions,
    isLoading: isRecurringLoading,
    error: recurringError,
    hasData: hasRecurringData,
    refetch: refetchRecurring,
  } = useRecurringTransactions(householdId)
  const {
    plans: installmentPlans,
    isLoading: isInstallmentPlansLoading,
    error: installmentPlansError,
    hasData: hasInstallmentPlansData,
    refetch: refetchInstallmentPlans,
  } = useInstallmentPlans(householdId)
  const {
    materializedCounts,
    isLoading: isMaterializedCountsLoading,
    error: materializedCountsError,
    hasData: hasMaterializedCountsData,
    refetch: refetchMaterializedCounts,
  } = useInstallmentMaterializedCounts(householdId)

  const horizon = getDayRangeHorizon(horizonDays)
  const { availableCashAgorot: startingBalanceAgorot, ...engineInputs } = assembleForecastInputs({
    accounts,
    balances,
    obligations,
    recurringTransactions,
    installmentPlans,
    materializedCounts,
  })

  const result = calculateCashFlowForecast({
    ...engineInputs,
    startingBalanceAgorot,
    startDate: horizon.start,
    endDate: horizon.end,
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
    hasData:
      hasAccountsData &&
      hasBalancesData &&
      hasObligationsData &&
      hasRecurringData &&
      hasInstallmentPlansData &&
      hasMaterializedCountsData,
    refetch: () => {
      void refetchAccounts()
      void refetchBalances()
      void refetchObligations()
      void refetchRecurring()
      void refetchInstallmentPlans()
      void refetchMaterializedCounts()
    },
  }
}
