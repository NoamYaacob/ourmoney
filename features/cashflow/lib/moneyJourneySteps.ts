// The Money Journey's own data-prep layer: turns a real
// CashFlowForecastResult into an ordered list of "steps" — one per real
// calendar day that has at least one real forecast event — each carrying
// everything the production component needs to draw EVENT -> DELTA ->
// RESULTING BALANCE without inventing anything. Computes zero new
// financial figures: every balance and amount here is read directly off
// `forecast.dailyPoints`/`forecast.events`, the same values
// calculateCashFlowForecast.ts already produced.
//
// Deliberately a new, from-scratch module rather than a rewrite of
// features/dashboard/components/FinancialTimeline.tsx's own `buildSteps` —
// that function stays exactly as it is, still backing Home's approved
// Direction D timeline unchanged (see MoneyJourney.tsx's own header for why
// CP8B does not touch Home). This module exists for a different form
// (event-owned geometry with a real BEFORE/AFTER, deterministic priority
// tiers, and a real dailyPoints INDEX for genuinely date-proportional
// placement — see lib/engines/cashflow/dailyPointScale.ts) that
// FinancialTimeline's own step shape doesn't carry.
//
// Deterministic event priority (CP8B's own explicit requirement): three
// tiers, decided entirely from real, already-computed figures — never an
// opaque or AI-derived "importance."
//   - critical: the monthly low point, or the step whose resulting balance
//     matches Safe-to-Spend (when a truthful match exists — see
//     `isConclusion` below).
//   - high: a severe-magnitude delta (>= SEVERE_DELTA_AGOROT, the same
//     ₪3,000 threshold FinancialTimeline.tsx already uses — kept here
//     rather than imported so this module has no dependency on a component
//     file), a same-day cluster of more than one event, or a NEW running
//     balance minimum that isn't the global low point (a real, distinct
//     dip worth calling out on its own — "an event producing a new local
//     low," CP8B's own example).
//   - routine: everything else. Still present, still fully accessible —
//     "quieter," never hidden from the data model itself. Label visibility
//     is a separate, later decision (resolveLabelCollisions.ts).

import type { CashFlowForecastEvent, CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

export const SEVERE_DELTA_AGOROT = 300_000 // ₪3,000 — matches FinancialTimeline.tsx's own threshold.

export type MoneyJourneyPriority = 'critical' | 'high' | 'routine'

export interface MoneyJourneyStep {
  id: string
  date: string
  // Index into the SAME forecast.dailyPoints array this step was derived
  // from — the only thing a caller needs to place this step on a
  // dailyPointScale (lib/engines/cashflow/dailyPointScale.ts) with genuine
  // date-proportional geometry.
  index: number
  beforeBalanceAgorot: number
  afterBalanceAgorot: number
  // afterBalanceAgorot - beforeBalanceAgorot, by construction — the causal
  // "BEFORE -> EVENT +/- DELTA -> AFTER" identity always holds exactly.
  deltaAgorot: number
  // The real event title when exactly one event lands this day; a real
  // count-based cluster label (via `clusterLabel`) otherwise. Never
  // invented text. Does not carry a "· שפל" suffix or similar — `isLow`/
  // `isLocalLow` are separate booleans so the caller decides how (or
  // whether) to annotate them, independent of this module's own strings.
  cause: string
  clusterCount: number
  // The single global monthly low point (forecast.lowestBalanceDate).
  isLow: boolean
  // A new running-balance minimum at this step that is NOT the global low
  // — a real, distinct dip along the way, not the floor itself.
  isLocalLow: boolean
  // True only when this step's resulting balance truthfully equals the
  // Safe-to-Spend figure passed in — never approximated, never forced.
  isConclusion: boolean
  severe: boolean
  priority: MoneyJourneyPriority
  events: CashFlowForecastEvent[]
}

export function buildMoneyJourneySteps(
  forecast: CashFlowForecastResult,
  safeToSpendAgorot: number | null,
  clusterLabel: (count: number) => string
): MoneyJourneyStep[] {
  const dateToIndex = new Map(forecast.dailyPoints.map((point, index) => [point.date, index]))

  const eventsByDate = new Map<string, CashFlowForecastEvent[]>()
  for (const event of forecast.events) {
    const list = eventsByDate.get(event.date)
    if (list) list.push(event)
    else eventsByDate.set(event.date, [event])
  }

  // Chronological running minimum, walked across EVERY real dailyPoint (not
  // just event days) so a local-low determination reflects the true
  // day-by-day balance path, not just the subset of days with events.
  let runningMin = forecast.startingBalanceAgorot
  const localLowDates = new Set<string>()
  for (const point of forecast.dailyPoints) {
    if (point.balanceAgorot < runningMin) {
      runningMin = point.balanceAgorot
      if (point.date !== forecast.lowestBalanceDate) localLowDates.add(point.date)
    }
  }

  const dates = [...eventsByDate.keys()].sort()

  return dates.map((date) => {
    const events = eventsByDate.get(date) as CashFlowForecastEvent[]
    const index = dateToIndex.get(date)
    // Every event date is guaranteed to fall inside the horizon
    // calculateCashFlowForecast.ts walked (events are filtered to
    // dueDate/occurrence <= endDate before this module ever sees them), so
    // this lookup cannot miss — a defensive fallback to the last point
    // exists only so a TypeScript-narrowed `undefined` can never propagate
    // into a NaN index downstream.
    const point = index !== undefined ? forecast.dailyPoints[index] : forecast.dailyPoints[forecast.dailyPoints.length - 1]
    const safeIndex = index ?? forecast.dailyPoints.length - 1
    const afterBalanceAgorot = point?.balanceAgorot ?? forecast.startingBalanceAgorot
    const deltaAgorot = (point?.inflowsAgorot ?? 0) - (point?.outflowsAgorot ?? 0)
    const beforeBalanceAgorot = afterBalanceAgorot - deltaAgorot

    const isLow = date === forecast.lowestBalanceDate
    const isLocalLow = localLowDates.has(date)
    const isConclusion = safeToSpendAgorot !== null && afterBalanceAgorot === safeToSpendAgorot
    const severe = Math.abs(deltaAgorot) >= SEVERE_DELTA_AGOROT
    const clusterCount = events.length

    const priority: MoneyJourneyPriority =
      isLow || isConclusion ? 'critical' : severe || clusterCount > 1 || isLocalLow ? 'high' : 'routine'

    return {
      id: date,
      date,
      index: safeIndex,
      beforeBalanceAgorot,
      afterBalanceAgorot,
      deltaAgorot,
      cause: clusterCount === 1 ? (events[0] as CashFlowForecastEvent).title : clusterLabel(clusterCount),
      clusterCount,
      isLow,
      isLocalLow,
      isConclusion,
      severe,
      priority,
      events,
    }
  })
}
