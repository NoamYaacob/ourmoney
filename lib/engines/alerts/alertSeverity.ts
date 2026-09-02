// Deterministic severity classification for Smart Financial Alerts. Pure
// constants + pure functions only — no AI, no subjective scoring
// (CLAUDE.md § Deterministic Financial Logic vs. AI / ADR-012). Every
// threshold here is a plain exported constant specifically so it can be
// tuned later without touching the classification logic itself, matching
// features/recurring/lib/priceIncreaseDetection.ts's own
// DEFAULT_PRICE_INCREASE_THRESHOLD precedent.
//
// The three FinancialAlertSeverity values (info/warning/critical) are a
// deliberate collapse of the milestone brief's own looser four-level prose
// ("critical/high/medium/info") onto FinancialAlert's actual severity union
// — reconciled here, once, rather than left ambiguous per call site.

import { THRESHOLD_EXCEEDED_PERCENT } from '@/features/budgets/lib/checkThresholdCrossing'
import type { FinancialAlertSeverity } from '@/types/app'

export const SEVERITY_ORDER: Record<FinancialAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

// ── Planned obligations ──────────────────────────────────────────────────
// Overdue (days < 0) is always critical, regardless of how overdue — an
// unpaid, already-due obligation does not become less urgent with time.
export const OBLIGATION_WARNING_MAX_DAYS = 3 // due today through 3 days out
export const OBLIGATION_INFO_MAX_DAYS = 7 // due 4-7 days out
// Beyond OBLIGATION_INFO_MAX_DAYS: no alert — not yet actionable.

export function obligationAlertSeverity(daysUntilDue: number): FinancialAlertSeverity | null {
  if (daysUntilDue < 0) return 'critical'
  if (daysUntilDue <= OBLIGATION_WARNING_MAX_DAYS) return 'warning'
  if (daysUntilDue <= OBLIGATION_INFO_MAX_DAYS) return 'info'
  return null
}

// ── Cash-flow forecast shortfall ─────────────────────────────────────────
export const FORECAST_SHORTFALL_CRITICAL_MAX_DAYS = 3
export const FORECAST_SHORTFALL_WARNING_MAX_DAYS = 14
// Beyond FORECAST_SHORTFALL_WARNING_MAX_DAYS (but still inside the forecast
// horizon this alert was computed over): info — worth knowing, not urgent.

export function forecastShortfallSeverity(daysUntilShortfall: number): FinancialAlertSeverity {
  if (daysUntilShortfall <= FORECAST_SHORTFALL_CRITICAL_MAX_DAYS) return 'critical'
  if (daysUntilShortfall <= FORECAST_SHORTFALL_WARNING_MAX_DAYS) return 'warning'
  return 'info'
}

// ── Budget risk ───────────────────────────────────────────────────────────
// Deliberately a SEPARATE threshold pair from features/budgets/lib/
// checkThresholdCrossing.ts's own THRESHOLD_REACHED_PERCENT (90) — that
// pair drives a one-shot, write-time "did this specific transaction just
// cross the line" push-notification pipeline (budgetThresholdSubscriber.ts),
// never touched by this milestone. This alert is the opposite kind of
// thing: an always-recomputed, read-time "what is true about this category
// right now" card, evaluated fresh on every render like Safe-to-Spend and
// Cash-Flow Forecast already are. A passively-visible card warning earlier
// (80%) than the one-shot push (90%) is an intentional product choice, not
// an inconsistency — a glanceable card can afford to speak up sooner than a
// push notification, which should stay rarer to avoid alert fatigue.
// THRESHOLD_EXCEEDED_PERCENT (100) IS reused directly for this alert's
// critical tier, though, so the two mechanisms never numerically drift on
// what "exceeded" means, even though "warning" legitimately differs.
export const BUDGET_RISK_WARNING_PERCENT = 80
export const BUDGET_RISK_CRITICAL_PERCENT = THRESHOLD_EXCEEDED_PERCENT

export function budgetRiskSeverity(percentSpent: number | null): FinancialAlertSeverity | null {
  if (percentSpent === null) return null
  if (percentSpent > BUDGET_RISK_CRITICAL_PERCENT) return 'critical'
  if (percentSpent >= BUDGET_RISK_WARNING_PERCENT) return 'warning'
  return null
}

// ── High credit-card cycle spend ─────────────────────────────────────────
// detectHighCreditCardCycleSpend.ts's own dual absolute+percent threshold
// already establishes "meaningful" before this is ever called — every
// detection it returns cleared that bar. This tier only distinguishes an
// ordinary heads-up from a genuinely alarming excess.
export const CREDIT_CARD_CYCLE_CRITICAL_EXCESS_PERCENT = 50

export function creditCardCycleSeverity(excessPercent: number): FinancialAlertSeverity {
  return excessPercent >= CREDIT_CARD_CYCLE_CRITICAL_EXCESS_PERCENT ? 'critical' : 'warning'
}

// ── Category spend above typical ─────────────────────────────────────────
// Always 'warning' — detectCategorySpendAboveTypical.ts's own dual threshold
// already filters to meaningful excesses only, the same "always warning,
// the detector already cleared the bar" reasoning
// buildPriceIncreaseAlerts uses for recurring_price_increase.

// ── Savings goal behind schedule ─────────────────────────────────────────
// Always 'warning' — a passed target date on an incomplete goal is a fact
// worth surfacing, not (by itself) a household emergency the way an
// over-committed cash position is.

// ── Excess cash available to accelerate a savings goal ───────────────────
// A positive suggestion, never a warning/critical tier — always 'info'.
export const EXCESS_CASH_MEANINGFUL_AGOROT = 200_000 // ₪2,000.00

// ── Low-balance warning (current state, before going negative) ──────────
// Deliberately distinct from FORECAST_SHORTFALL above: this reads
// SafeToSpendResult.safeToSpendAgorot as of RIGHT NOW, not a future
// projected date — "warn before going negative," not only "warn once a
// future shortfall date is projected."
export const LOW_BALANCE_WARNING_AGOROT = 50_000 // ₪500.00

export function lowBalanceSeverity(safeToSpendAgorot: number): FinancialAlertSeverity | null {
  if (safeToSpendAgorot < 0) return 'critical'
  if (safeToSpendAgorot < LOW_BALANCE_WARNING_AGOROT) return 'warning'
  return null
}

// Local-calendar-date day difference (toDate - fromDate, in whole days),
// matching lib/engines/cashflow/horizonRange.ts's own local-Date-getter
// style — never a UTC/ISO parse, and never re-derived per call site here.
export function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split('-').map(Number) as [number, number, number]
  const [ty, tm, td] = toDate.split('-').map(Number) as [number, number, number]
  const from = new Date(fy, fm - 1, fd)
  const to = new Date(ty, tm - 1, td)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}
