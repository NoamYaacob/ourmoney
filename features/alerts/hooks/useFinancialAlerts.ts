// Supabase-aware composition layer only — every actual classification/
// aggregation happens in lib/engines/alerts/buildFinancialAlerts.ts (pure,
// unit-tested, no network). Composes pre-existing, unmodified hooks — no new
// Supabase query anywhere in this file beyond one extra useTransactions
// window (reusing the exact same hook/query-key prefix Dashboard's own
// analytics section already uses for its 6-month trend, just a narrower
// window sized for this hook's own needs).
//
// Deliberately DIVERGES from useSafeToSpend.ts/useCashFlowForecast.ts's own
// "error = first-non-null-wins across every source" pattern. Those two
// hooks each represent ONE coherent number that genuinely can't be computed
// correctly from partial data — showing half a Safe-to-Spend figure would
// be worse than showing none. Alerts are different by this milestone's own
// explicit requirement: they're independent sources feeding one list, and a
// household whose price-increase detector query fails should still see
// their overdue-obligation alert. So `alerts` is built from whatever
// sources succeeded (a failed source contributes an empty/null input to
// buildFinancialAlerts, never a thrown error), and `hasPartialError` is a
// separate, non-blocking signal — never used to blank the list itself.

import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { usePlannedObligations } from '@/features/obligations/hooks/usePlannedObligations'
import { usePriceIncreaseDetections } from '@/features/recurring/hooks/usePriceIncreaseDetections'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { resolveGoalCurrentAgorot } from '@/features/savings/lib/goalProgress'
import { getCurrentMonthPeriodStart, getPeriodEnd, localDateString, shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { computeCategoryBreakdown } from '@/features/analytics/lib/categoryBreakdown'
import { buildFinancialAlerts } from '@/lib/engines/alerts/buildFinancialAlerts'
import type { CategoryMonthObservation } from '@/lib/engines/alerts/detectCategorySpendAboveTypical'
import type { FinancialAlert } from '@/types/app'

// Fixed at the same 30-day default the Cash-Flow Forecast detail screen
// itself defaults to — alerts answer "what needs attention now," not a
// user-selectable horizon.
const ALERTS_FORECAST_HORIZON_DAYS = 30

// How many complete prior months feed the category-spend-above-typical
// baseline — chosen deliberately smaller than
// priceIncreaseDetection.ts's BASELINE_WINDOW (6): that window bounds a
// per-bill occurrence history, while this one bounds full CALENDAR MONTHS
// of one query's transaction window, so 3 already means "the last quarter,"
// a reasonable typical-spend baseline without fetching a much wider range
// than every other query on this hook.
const CATEGORY_SPEND_HISTORICAL_MONTHS = 3

export interface UseFinancialAlertsResult {
  alerts: FinancialAlert[]
  isLoading: boolean
  hasPartialError: boolean
  refetch: () => void
}

export function useFinancialAlerts(householdId: string | null | undefined): UseFinancialAlertsResult {
  const forecast = useCashFlowForecast(householdId, ALERTS_FORECAST_HORIZON_DAYS)
  const obligations = usePlannedObligations(householdId)
  const priceIncrease = usePriceIncreaseDetections(householdId)
  const budget = useBudgetProgress(householdId, getCurrentMonthPeriodStart())
  const accounts = useAccounts(householdId)
  const categories = useCategories(householdId)
  const savingsGoals = useSavingsGoals(householdId)
  const accountBalances = useAccountBalances(householdId)
  const safeToSpend = useSafeToSpend(householdId, 'month')

  const today = localDateString()
  const currentMonthStart = getCurrentMonthPeriodStart()
  const analyticsWindowStart = shiftMonth(currentMonthStart, -CATEGORY_SPEND_HISTORICAL_MONTHS)
  // Same window covers BOTH the category-spend baseline (needs full
  // calendar months of history) and the credit-card cycle comparison (needs
  // only the current + previous billing cycle, well within this range for
  // any billing_cycle_day) — one query, two detectors, no duplicate fetch.
  const recentTransactions = useTransactions(householdId, {
    periodStart: analyticsWindowStart,
    periodEnd: getPeriodEnd(currentMonthStart),
  })

  const categoryNameById = new Map(categories.categories.map((c) => [c.id, c.name_he]))

  const analyticsInput = recentTransactions.transactions.map((t) => ({
    categoryId: t.category_id,
    amountAgorot: t.amount_agorot,
    txnDate: t.txn_date,
    isShared: t.is_shared,
    isExcluded: t.is_excluded,
    transferId: t.transfer_id,
  }))

  function breakdownToObservations(periodStart: string): CategoryMonthObservation[] {
    return computeCategoryBreakdown(analyticsInput, periodStart).map((entry) => ({
      categoryId: entry.categoryId,
      categoryNameHe: categoryNameById.get(entry.categoryId) ?? '',
      spentAgorot: entry.spentAgorot,
    }))
  }

  const historicalMonthStarts = Array.from({ length: CATEGORY_SPEND_HISTORICAL_MONTHS }, (_, i) =>
    shiftMonth(currentMonthStart, -(CATEGORY_SPEND_HISTORICAL_MONTHS - i))
  )

  const creditCardAccounts = accounts.accounts.filter(
    (a) => a.type === 'credit_card' && a.billing_cycle_day !== null
  )

  const alerts = buildFinancialAlerts({
    today,
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
    creditCardCycles:
      accounts.error || recentTransactions.error
        ? []
        : creditCardAccounts.map((account) => ({
            accountId: account.id,
            accountName: account.name,
            billingCycleDay: account.billing_cycle_day as number,
            transactions: recentTransactions.transactions
              .filter((t) => t.account_id === account.id)
              .map((t) => ({
                amount_agorot: t.amount_agorot,
                txn_date: t.txn_date,
                transfer_id: t.transfer_id,
                is_excluded: t.is_excluded,
              })),
          })),
    categorySpend:
      recentTransactions.error || categories.error
        ? null
        : {
            currentMonth: breakdownToObservations(currentMonthStart),
            historicalMonths: historicalMonthStarts.map((start) => breakdownToObservations(start)),
          },
    // Gated on savingsGoals.error only — NOT accountBalances.error too.
    // resolveGoalCurrentAgorot only reads accountBalances for a
    // 'linked_account' goal (a 'manual' goal returns its own current_agorot
    // untouched); coupling the whole list to accountBalances.error would
    // silently drop savings_goal_behind/excess_cash_available alerts for
    // every manual goal too on a transient balances-query failure
    // (qa-adversarial-reviewer finding). accountBalances.balances already
    // degrades to {} on its own error (useAccountBalances.ts), so a
    // linked-account goal still resolves — just to 0 rather than crashing —
    // exactly the same partial-degradation every other source here accepts.
    savingsGoals: savingsGoals.error
      ? []
      : savingsGoals.goals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          currentAgorot: resolveGoalCurrentAgorot(goal, accountBalances.balances),
          targetAgorot: goal.target_agorot,
          targetDate: goal.target_date,
        })),
    safeToSpendAgorot: safeToSpend.error ? null : safeToSpend.result.safeToSpendAgorot,
  })

  return {
    alerts,
    isLoading:
      forecast.isLoading ||
      obligations.isLoading ||
      priceIncrease.isLoading ||
      budget.isLoading ||
      accounts.isLoading ||
      categories.isLoading ||
      savingsGoals.isLoading ||
      accountBalances.isLoading ||
      recentTransactions.isLoading ||
      safeToSpend.isLoading,
    hasPartialError: !!(
      forecast.error ||
      obligations.error ||
      priceIncrease.error ||
      budget.error ||
      accounts.error ||
      categories.error ||
      savingsGoals.error ||
      accountBalances.error ||
      recentTransactions.error ||
      safeToSpend.error
    ),
    refetch: () => {
      void forecast.refetch()
      void obligations.refetch()
      void priceIncrease.refetch()
      void budget.refetch()
      void accounts.refetch()
      void categories.refetch()
      void savingsGoals.refetch()
      void accountBalances.refetch()
      void recentTransactions.refetch()
      void safeToSpend.refetch()
    },
  }
}
