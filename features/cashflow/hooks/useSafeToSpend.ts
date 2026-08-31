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
import { assembleForecastInputs } from '@/lib/engines/cashflow/assembleForecastInputs'
import { getHorizonRange, type HorizonKind, type HorizonRange } from '@/lib/engines/cashflow/horizonRange'
import { calculateSafeToSpend, type SafeToSpendResult } from '@/lib/engines/cashflow/calculateSafeToSpend'

export interface UseSafeToSpendResult {
  result: SafeToSpendResult
  horizon: HorizonRange
  isLoading: boolean
  error: Error | null
  // True only once EVERY one of the six composed sources has resolved with
  // data at least once. `result` is always a fully-computed value (it maps
  // over each source's own `data ?? []`/`{}` default), so it can never be
  // used by itself to tell "genuinely nothing has loaded yet" apart from
  // "everything loaded, `result` just happens to be all zeros" — this flag
  // is that signal. Once true it stays true through any later background
  // refetch failure (see useAccounts.ts's `hasData` for why), so a caller
  // can keep showing `result` and treat `error` as a non-blocking, "could
  // not refresh" signal instead of discarding good data.
  hasData: boolean
  // Re-runs every one of the six composed queries. This is the Home hero's
  // own data source — the exact screen the intermittent "משהו השתבש" error
  // was reported on — so a household that still hits a genuine failure
  // (not the focus-refetch race lib/queryClient.ts now guards against; a
  // real network/server error) has a way to ask again without navigating
  // away and back.
  refetch: () => void
}

export function useSafeToSpend(
  householdId: string | null | undefined,
  horizonKind: HorizonKind
): UseSafeToSpendResult {
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
    maxMaterializedIndices,
    isLoading: isMaterializedCountsLoading,
    error: materializedCountsError,
    hasData: hasMaterializedCountsData,
    refetch: refetchMaterializedCounts,
  } = useInstallmentMaterializedCounts(householdId)

  const horizon = getHorizonRange(horizonKind)
  const engineInputs = assembleForecastInputs({
    accounts,
    balances,
    obligations,
    recurringTransactions,
    installmentPlans,
    maxMaterializedIndices,
  })

  const result = calculateSafeToSpend({
    ...engineInputs,
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
