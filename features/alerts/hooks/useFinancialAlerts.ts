// Supabase-aware composition layer only — every actual classification/
// aggregation happens in lib/engines/alerts/buildFinancialAlerts.ts (pure,
// unit-tested, no network). Composes FOUR pre-existing, unmodified hooks —
// no new Supabase query anywhere in this file.
//
// Deliberately DIVERGES from useSafeToSpend.ts/useCashFlowForecast.ts's own
// "error = first-non-null-wins across every source" pattern. Those two
// hooks each represent ONE coherent number that genuinely can't be computed
// correctly from partial data — showing half a Safe-to-Spend figure would
// be worse than showing none. Alerts are different by this milestone's own
// explicit requirement: they're four INDEPENDENT sources feeding one list,
// and a household whose price-increase detector query fails should still
// see their overdue-obligation alert. So `alerts` is built from whatever
// sources succeeded (a failed source contributes an empty/null input to
// buildFinancialAlerts, never a thrown error), and `hasPartialError` is a
// separate, non-blocking signal — never used to blank the list itself.

import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { usePriceIncreaseDetections } from '@/features/recurring/hooks/usePriceIncreaseDetections'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { getCurrentMonthPeriodStart, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { buildFinancialAlerts } from '@/lib/engines/alerts/buildFinancialAlerts'
import type { FinancialAlert } from '@/types/app'

// Fixed at the same 30-day default the Cash-Flow Forecast detail screen
// itself defaults to — alerts answer "what needs attention now," not a
// user-selectable horizon.
const ALERTS_FORECAST_HORIZON_DAYS = 30

export interface UseFinancialAlertsResult {
  alerts: FinancialAlert[]
  isLoading: boolean
  hasPartialError: boolean
}

export function useFinancialAlerts(householdId: string | null | undefined): UseFinancialAlertsResult {
  const forecast = useCashFlowForecast(householdId, ALERTS_FORECAST_HORIZON_DAYS)
  const obligations = usePlannedObligations(householdId)
  const priceIncrease = usePriceIncreaseDetections(householdId)
  const budget = useBudgetProgress(householdId, getCurrentMonthPeriodStart())

  const alerts = buildFinancialAlerts({
    today: localDateString(),
    forecast: forecast.error ? null : forecast.result,
    obligations: obligations.error
      ? []
      : obligations.obligations.map((o) => ({
          id: o.id,
          name: o.name,
          amountAgorot: o.amount_agorot,
          dueDate: o.due_date,
          status: o.status,
          categoryId: o.category_id,
          accountId: o.account_id,
        })),
    priceIncreaseDetections: priceIncrease.error ? [] : priceIncrease.detections,
    budgetCategories: budget.error ? [] : budget.categories,
  })

  return {
    alerts,
    isLoading: forecast.isLoading || obligations.isLoading || priceIncrease.isLoading || budget.isLoading,
    hasPartialError: !!(forecast.error || obligations.error || priceIncrease.error || budget.error),
  }
}
