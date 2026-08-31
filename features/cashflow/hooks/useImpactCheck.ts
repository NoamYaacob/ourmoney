// CP8F — Supabase-aware composition layer for Single Purchase Impact Check,
// same shape as useSafeToSpend.ts/useCashFlowForecast.ts: fetches the
// household's data via the same six existing, unmodified hooks (same
// TanStack Query keys, so this hook never issues a duplicate network
// request alongside useSafeToSpend/useCashFlowForecast on the same screen),
// assembles the shared engine input shape via assembleForecastInputs, and
// exposes `calculate` — a pure, synchronous function of one hypothetical
// amount, closed over the already-fetched data.
//
// Deliberately exposes a FUNCTION, not a stored result: this checkpoint's
// brief is explicit that Impact Check has no saved scenarios and no
// persistence — calling `calculate` a second time with a different amount
// must never depend on, or leave behind, anything from the first call.
// Nothing here writes to Supabase, nothing is cached keyed by amount.

import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useInstallmentMaterializedCounts } from '@/features/installments/hooks/useInstallmentMaterializedCounts'
import { assembleForecastInputs } from '@/lib/engines/cashflow/assembleForecastInputs'
import { getHorizonRange, getDayRangeHorizon } from '@/lib/engines/cashflow/horizonRange'
import { calculateImpactCheck, type ImpactCheckResult } from '@/lib/engines/cashflow/calculateImpactCheck'

// Matches the Safe-to-Spend detail screen's own horizon ('month' —
// app/(app)/safe-to-spend/index.tsx) and Home's own cash-flow timeline
// horizon (30 days — MobileHome.tsx/DesktopDashboard.tsx's own
// CASH_FLOW_TIMELINE_HORIZON_DAYS) since Impact Check is reached FROM that
// screen and must answer against the same figures it already shows, not a
// third, divergent horizon.
const FORECAST_HORIZON_DAYS = 30

export interface UseImpactCheckResult {
  isLoading: boolean
  error: Error | null
  // Same "every one of the six composed sources has resolved with data at
  // least once" contract as useSafeToSpend.ts/useCashFlowForecast.ts's own
  // `hasData` — see either file's header for the full rationale.
  hasData: boolean
  refetch: () => void
  calculate: (hypotheticalExpenseAgorot: number) => ImpactCheckResult
}

export function useImpactCheck(householdId: string | null | undefined): UseImpactCheckResult {
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

  const safeToSpendHorizon = getHorizonRange('month')
  const forecastHorizon = getDayRangeHorizon(FORECAST_HORIZON_DAYS)
  const engineInputs = assembleForecastInputs({
    accounts,
    balances,
    obligations,
    recurringTransactions,
    installmentPlans,
    materializedCounts,
  })

  return {
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
    calculate: (hypotheticalExpenseAgorot: number) =>
      calculateImpactCheck({
        ...engineInputs,
        safeToSpendHorizonEnd: safeToSpendHorizon.end,
        forecastStartDate: forecastHorizon.start,
        forecastEndDate: forecastHorizon.end,
        hypotheticalExpenseAgorot,
      }),
  }
}
