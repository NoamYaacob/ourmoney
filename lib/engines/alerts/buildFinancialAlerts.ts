// Smart Financial Alerts V1 — the aggregation engine. Combines FOUR
// already-computed domain sources into one deterministic, deduplicated,
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
import type { BudgetCategoryProgress, FinancialAlert } from '@/types/app'
import { budgetRiskSeverity, daysBetween, forecastShortfallSeverity, obligationAlertSeverity, SEVERITY_ORDER } from './alertSeverity'

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

export function buildFinancialAlerts(input: BuildFinancialAlertsInput): FinancialAlert[] {
  const alerts: FinancialAlert[] = [
    ...[buildForecastShortfallAlert(input.forecast, input.today)].filter((a): a is FinancialAlert => a !== null),
    ...buildObligationAlerts(input.obligations, input.today),
    ...buildPriceIncreaseAlerts(input.priceIncreaseDetections),
    ...buildBudgetRiskAlerts(input.budgetCategories),
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
