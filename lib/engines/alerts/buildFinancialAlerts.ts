// Smart Financial Alerts V1(+expansion) — the aggregation engine. Combines
// NINE already-computed domain sources into one deterministic, deduplicated,
// severity-sorted list. Computes NOTHING itself that one of those sources
// doesn't already own:
//
//   FORECAST_SHORTFALL       ← lib/engines/cashflow/calculateCashFlowForecast.ts
//                               (firstShortfallDate / lowestBalanceAgorot,
//                               never recomputed here)
//   UPCOMING_OBLIGATION      ← planned_obligations rows, classified by a
//                               deterministic day-window (alertSeverity.ts)
//   RECURRING_PRICE_INCREASE ← features/recurring/lib/priceIncreaseDetection.ts's
//                               detectPriceIncreases() output, reused as-is —
//                               no second detector
//   BUDGET_RISK              ← features/budgets/hooks/useBudgetProgress.ts's
//                               already-computed percentSpent per category —
//                               no new budget calculation
//   HIGH_CREDIT_CARD_CYCLE_SPEND ← lib/engines/alerts/detectHighCreditCardCycleSpend.ts,
//                               itself built entirely on
//                               features/accounts/lib/creditCardCycle.ts's
//                               existing cycle-range/spend functions
//   CATEGORY_SPEND_ABOVE_TYPICAL ← lib/engines/alerts/detectCategorySpendAboveTypical.ts,
//                               fed by features/analytics/lib/categoryBreakdown.ts's
//                               existing computeCategoryBreakdown()
//   SAVINGS_GOAL_BEHIND       ← lib/engines/savings/calculateSavingsPace.ts's
//                               own isOverdue/isOnTrack fields, reused as-is —
//                               no second savings-pace calculation
//   EXCESS_CASH_AVAILABLE    ← the same SafeToSpendResult.safeToSpendAgorot
//                               the Dashboard/Cash-Flow screens already show
//   LOW_BALANCE_WARNING      ← the same SafeToSpendResult.safeToSpendAgorot,
//                               read as a CURRENT state rather than a future
//                               projected date (distinct from
//                               FORECAST_SHORTFALL above)
//
// i18n: this module calls i18n.t() directly to compose each alert's
// title/description ONCE (not duplicated across the Dashboard section and
// the /alerts screen). This has a direct, working precedent in this exact
// codebase: lib/notifications/router.ts's renderBudgetThresholdReached()
// etc. already call i18n.t() from a plain function outside any React
// component or hook. This module still imports nothing this milestone's
// own brief actually forbids for the engine layer — React, Expo Router,
// Supabase, and expo-notifications are never imported here; i18n string
// composition is not any of those. (Every OTHER engine in lib/engines/ is
// 100% textless because none of them have ever needed to render a sentence
// before — this is the first one that legitimately does, since one
// FinancialAlert renders identically across two separate screens.)
//
// No React, Expo Router, Supabase, or push-notification import — the pure
// engine only knows already-computed domain state, matching this
// milestone's own explicit constraint.

import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import type { CashFlowForecastResult } from '../cashflow/calculateCashFlowForecast'
import type { PlannedObligationForecastInput } from '../cashflow/calculateSafeToSpend'
import type { PriceIncreaseDetection } from '@/features/recurring/lib/priceIncreaseDetection'
import {
  detectHighCreditCardCycleSpend,
  type CreditCardCycleAccountInput,
} from './detectHighCreditCardCycleSpend'
import {
  detectCategorySpendAboveTypical,
  type CategoryMonthObservation,
} from './detectCategorySpendAboveTypical'
import { calculateSavingsPace } from '../savings/calculateSavingsPace'
import type { BudgetCategoryProgress, FinancialAlert } from '@/types/app'
import {
  budgetRiskSeverity,
  creditCardCycleSeverity,
  daysBetween,
  EXCESS_CASH_MEANINGFUL_AGOROT,
  forecastShortfallSeverity,
  lowBalanceSeverity,
  obligationAlertSeverity,
  SEVERITY_ORDER,
} from './alertSeverity'

// The minimal savings-goal shape this engine needs — deliberately not the
// full SavingsGoal DB row (progress_source/current_agorot resolution for
// linked-account goals happens in the caller, via
// features/savings/lib/goalProgress.ts's existing resolveGoalCurrentAgorot,
// exactly the milestone's own "for account-linked goals derive progress
// from the linked account balance" instruction — this engine never touches
// account balances itself).
export interface SavingsGoalAlertInput {
  id: string
  name: string
  currentAgorot: number
  targetAgorot: number
  targetDate: string | null
}

export interface BuildFinancialAlertsInput {
  today: string
  // Each source is independently nullable/empty — a hook-level partial
  // failure contributes zero alerts from that source, never a thrown error
  // (this milestone's own explicit "one failed detector must not blank the
  // whole feed" requirement — see features/alerts/hooks/useFinancialAlerts.ts).
  forecast: CashFlowForecastResult | null
  obligations: readonly PlannedObligationForecastInput[]
  priceIncreaseDetections: readonly PriceIncreaseDetection[]
  budgetCategories: readonly BudgetCategoryProgress[]
  creditCardCycles: readonly CreditCardCycleAccountInput[]
  categorySpend: {
    currentMonth: readonly CategoryMonthObservation[]
    historicalMonths: readonly (readonly CategoryMonthObservation[])[]
  } | null
  savingsGoals: readonly SavingsGoalAlertInput[]
  // Just the one field every new source below actually needs — never the
  // full SafeToSpendResult, so this engine can't accidentally start
  // recomputing something eligibleCashAccounts.ts/calculateSafeToSpend.ts
  // already own.
  safeToSpendAgorot: number | null
}

function buildForecastShortfallAlert(
  forecast: CashFlowForecastResult | null,
  today: string
): FinancialAlert | null {
  if (!forecast || !forecast.firstShortfallDate) return null

  const daysUntil = daysBetween(today, forecast.firstShortfallDate)
  // The amount paired with firstShortfallDate must be THAT day's own
  // balance, not lowestBalanceAgorot — the two can legitimately be
  // different days (e.g. a small early dip that recovers, followed by a
  // much larger dip later from an annual payment). Using the horizon-wide
  // minimum here would misreport a wrong figure next to a specific real
  // date (qa-adversarial-reviewer finding). Falls back to lowestBalanceAgorot
  // only if dailyPoints somehow doesn't contain the exact date — should
  // never happen given the engine's own invariant that dailyPoints covers
  // every day in [startDate, endDate] and firstShortfallDate is derived by
  // scanning that same array.
  const balanceOnShortfallDate =
    forecast.dailyPoints.find((point) => point.date === forecast.firstShortfallDate)?.balanceAgorot ??
    forecast.lowestBalanceAgorot
  const shortfallAgorot = balanceOnShortfallDate < 0 ? -balanceOnShortfallDate : 0

  return {
    id: `forecast_shortfall:${forecast.firstShortfallDate}`,
    type: 'forecast_shortfall',
    severity: forecastShortfallSeverity(daysUntil),
    title: i18n.t('alerts.forecastShortfall.title'),
    description: i18n.t('alerts.forecastShortfall.description', {
      date: forecast.firstShortfallDate,
      amount: formatILS(shortfallAgorot),
    }),
    date: forecast.firstShortfallDate,
    amountAgorot: shortfallAgorot,
    source: 'cash_flow',
    sourceId: null,
    actionRoute: '/cash-flow',
  }
}

function buildObligationAlerts(
  obligations: readonly PlannedObligationForecastInput[],
  today: string
): FinancialAlert[] {
  const alerts: FinancialAlert[] = []

  for (const obligation of obligations) {
    if (obligation.status !== 'upcoming') continue

    const daysUntilDue = daysBetween(today, obligation.dueDate)
    const severity = obligationAlertSeverity(daysUntilDue)
    if (severity === null) continue

    const title =
      daysUntilDue < 0
        ? i18n.t('alerts.upcomingObligation.overdueTitle', { name: obligation.name })
        : daysUntilDue === 0
          ? i18n.t('alerts.upcomingObligation.todayTitle', { name: obligation.name })
          : i18n.t('alerts.upcomingObligation.dueInDaysTitle', { name: obligation.name, days: daysUntilDue })

    alerts.push({
      id: `upcoming_obligation:${obligation.id}`,
      type: 'upcoming_obligation',
      severity,
      title,
      description: i18n.t('alerts.upcomingObligation.description', {
        amount: formatILS(obligation.amountAgorot),
        date: obligation.dueDate,
      }),
      date: obligation.dueDate,
      amountAgorot: obligation.amountAgorot,
      source: 'planned_obligation',
      sourceId: obligation.id,
      actionRoute: `/obligations/${obligation.id}`,
    })
  }

  return alerts
}

function buildPriceIncreaseAlerts(detections: readonly PriceIncreaseDetection[]): FinancialAlert[] {
  return detections.map((detection) => ({
    id: `recurring_price_increase:${detection.identityKey}`,
    type: 'recurring_price_increase',
    // detectPriceIncreases() already applies its own conservative
    // absolute-AND-percent threshold (DEFAULT_PRICE_INCREASE_THRESHOLD) —
    // every detection it returns already cleared the "meaningful" bar, so
    // no further severity tiering is needed here; always warning.
    severity: 'warning',
    title: i18n.t('alerts.priceIncrease.title'),
    description: i18n.t('alerts.priceIncrease.description', {
      name: detection.description,
      previous: formatILS(detection.previousAmountAgorot),
      current: formatILS(detection.currentAmountAgorot),
    }),
    date: detection.detectedAt,
    amountAgorot: detection.increaseAgorot,
    source: 'recurring',
    sourceId: detection.identityKey,
    actionRoute: detection.recurringId
      ? `/recurring/${detection.recurringId}`
      : `/transactions/${detection.currentTransactionId}`,
  }))
}

function buildBudgetRiskAlerts(categories: readonly BudgetCategoryProgress[]): FinancialAlert[] {
  const alerts: FinancialAlert[] = []

  for (const category of categories) {
    const severity = budgetRiskSeverity(category.percentSpent)
    if (severity === null) continue

    alerts.push({
      id: `budget_risk:${category.categoryId}`,
      type: 'budget_risk',
      severity,
      title: i18n.t('alerts.budgetRisk.title'),
      description: i18n.t('alerts.budgetRisk.description', {
        category: category.categoryNameHe,
        percent: category.percentSpent,
      }),
      date: null,
      amountAgorot: null,
      source: 'budget',
      sourceId: category.categoryId,
      actionRoute: '/budgets',
    })
  }

  return alerts
}

function buildCreditCardCycleAlerts(accounts: readonly CreditCardCycleAccountInput[], today: string): FinancialAlert[] {
  const alerts: FinancialAlert[] = []

  for (const account of accounts) {
    const detection = detectHighCreditCardCycleSpend(account, today)
    if (!detection) continue

    alerts.push({
      id: `high_credit_card_cycle_spend:${detection.accountId}`,
      type: 'high_credit_card_cycle_spend',
      severity: creditCardCycleSeverity(detection.excessPercent),
      title: i18n.t('alerts.highCreditCardCycleSpend.title', { name: detection.accountName }),
      description: i18n.t('alerts.highCreditCardCycleSpend.description', {
        current: formatILS(detection.currentCycleSpendAgorot),
        previous: formatILS(detection.previousCycleSpendAgorot),
      }),
      date: detection.currentCycleEnd,
      amountAgorot: detection.excessAgorot,
      source: 'account',
      sourceId: detection.accountId,
      actionRoute: `/accounts/${detection.accountId}`,
    })
  }

  return alerts
}

function buildCategorySpendAlerts(
  categorySpend: BuildFinancialAlertsInput['categorySpend']
): FinancialAlert[] {
  if (!categorySpend) return []

  return detectCategorySpendAboveTypical(categorySpend.currentMonth, categorySpend.historicalMonths).map(
    (detection) => ({
      id: `category_spend_above_typical:${detection.categoryId}`,
      type: 'category_spend_above_typical',
      // Always warning — the detector's own dual threshold already filters
      // to meaningful excesses only, same reasoning as
      // buildPriceIncreaseAlerts.
      severity: 'warning',
      title: i18n.t('alerts.categorySpendAboveTypical.title', { category: detection.categoryNameHe }),
      description: i18n.t('alerts.categorySpendAboveTypical.description', {
        category: detection.categoryNameHe,
        current: formatILS(detection.currentSpentAgorot),
        typical: formatILS(detection.typicalAgorot),
      }),
      date: null,
      amountAgorot: detection.excessAgorot,
      source: 'budget',
      sourceId: detection.categoryId,
      actionRoute: '/budgets',
    })
  )
}

function buildSavingsGoalBehindAlerts(goals: readonly SavingsGoalAlertInput[], today: string): FinancialAlert[] {
  const alerts: FinancialAlert[] = []

  for (const goal of goals) {
    const pace = calculateSavingsPace({
      currentAgorot: goal.currentAgorot,
      targetAgorot: goal.targetAgorot,
      targetDate: goal.targetDate,
      today,
    })
    // Same single-source-of-truth reasoning as app/(app)/goals/[id].tsx and
    // goals/index.tsx: "behind" is read from the pace calculation's own
    // remainingAgorot/isOverdue, never from a separately-derived completion
    // flag that could drift one render behind.
    if (!pace || pace.remainingAgorot === 0 || !pace.isOverdue) continue

    alerts.push({
      id: `savings_goal_behind:${goal.id}`,
      type: 'savings_goal_behind',
      severity: 'warning',
      title: i18n.t('alerts.savingsGoalBehind.title', { name: goal.name }),
      description: i18n.t('alerts.savingsGoalBehind.description', {
        name: goal.name,
        amount: formatILS(pace.remainingAgorot),
      }),
      date: goal.targetDate,
      amountAgorot: pace.remainingAgorot,
      source: 'savings_goal',
      sourceId: goal.id,
      actionRoute: `/goals/${goal.id}`,
    })
  }

  return alerts
}

function buildExcessCashAlert(
  safeToSpendAgorot: number | null,
  goals: readonly SavingsGoalAlertInput[],
  today: string
): FinancialAlert | null {
  if (safeToSpendAgorot === null || safeToSpendAgorot < EXCESS_CASH_MEANINGFUL_AGOROT) return null

  // Only meaningful if there is at least one incomplete goal to accelerate —
  // "meaningful excess cash" that could accelerate a savings goal has
  // nothing to accelerate otherwise.
  const hasIncompleteGoal = goals.some((goal) => {
    const pace = calculateSavingsPace({
      currentAgorot: goal.currentAgorot,
      targetAgorot: goal.targetAgorot,
      targetDate: goal.targetDate,
      today,
    })
    // A goal with no target date still has a positive remainingAgorot to
    // accelerate even though calculateSavingsPace itself returns null for
    // it (no date to project against) — checked directly here rather than
    // via pace, which is null in exactly that case.
    return goal.currentAgorot < goal.targetAgorot || (pace !== null && pace.remainingAgorot > 0)
  })
  if (!hasIncompleteGoal) return null

  return {
    id: 'excess_cash_available',
    type: 'excess_cash_available',
    severity: 'info',
    title: i18n.t('alerts.excessCashAvailable.title'),
    description: i18n.t('alerts.excessCashAvailable.description', { amount: formatILS(safeToSpendAgorot) }),
    date: null,
    amountAgorot: safeToSpendAgorot,
    source: 'cash_flow',
    sourceId: null,
    actionRoute: '/goals',
  }
}

function buildLowBalanceAlert(safeToSpendAgorot: number | null): FinancialAlert | null {
  if (safeToSpendAgorot === null) return null
  const severity = lowBalanceSeverity(safeToSpendAgorot)
  if (severity === null) return null

  return {
    id: 'low_balance_warning',
    type: 'low_balance_warning',
    severity,
    title: i18n.t(
      severity === 'critical' ? 'alerts.lowBalanceWarning.negativeTitle' : 'alerts.lowBalanceWarning.title'
    ),
    description: i18n.t('alerts.lowBalanceWarning.description', { amount: formatILS(safeToSpendAgorot) }),
    date: null,
    amountAgorot: safeToSpendAgorot,
    source: 'cash_flow',
    sourceId: null,
    actionRoute: '/cash-flow',
  }
}

export function buildFinancialAlerts(input: BuildFinancialAlertsInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [
    ...[buildForecastShortfallAlert(input.forecast, input.today)].filter((a): a is FinancialAlert => a !== null),
    ...buildObligationAlerts(input.obligations, input.today),
    ...buildPriceIncreaseAlerts(input.priceIncreaseDetections),
    ...buildBudgetRiskAlerts(input.budgetCategories),
    ...buildCreditCardCycleAlerts(input.creditCardCycles, input.today),
    ...buildCategorySpendAlerts(input.categorySpend),
    ...buildSavingsGoalBehindAlerts(input.savingsGoals, input.today),
    ...[buildExcessCashAlert(input.safeToSpendAgorot, input.savingsGoals, input.today)].filter(
      (a): a is FinancialAlert => a !== null
    ),
    ...[buildLowBalanceAlert(input.safeToSpendAgorot)].filter((a): a is FinancialAlert => a !== null),
  ]

  // Severity first, then urgency (soonest date first — undated alerts, e.g.
  // budget_risk, sort after every dated alert within the same severity
  // tier via a high sentinel, since a concrete date conveys more immediate
  // urgency than a standing state), then a stable id tiebreak so ordering
  // never depends on array-construction order above.
  return alerts.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (severityDiff !== 0) return severityDiff
    const dateDiff = (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31')
    if (dateDiff !== 0) return dateDiff
    return a.id.localeCompare(b.id)
  })
}
