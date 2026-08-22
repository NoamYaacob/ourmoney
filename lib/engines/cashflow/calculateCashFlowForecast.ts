// A deterministic, forward-looking projection of the household's pooled
// cash balance — built directly on the Safe-to-Spend primitives rather
// than a second parallel system. No AI, no discretionary-spending
// forecast, no inferred income (CLAUDE.md § Deterministic Financial Logic
// vs. AI / ADR-012).
//
//   projectedBalance(day N)
//   = startingBalanceAgorot
//   + confirmed inflows through day N   (recurring income templates)
//   − confirmed outflows through day N  (planned obligations + recurring
//                                         expense templates + not-yet-
//                                         materialized instalment charges,
//                                         migration 016/ADR-037)
//
// Reuses, does not reimplement:
//   - forecastRecurringOccurrences (recurrence date math, both signs since
//     that primitive was broadened for this engine — see its own header)
//   - forecastInstallmentOccurrences (instalment date math + remainder
//     handling — see its own header)
//   - the same obligations/recurring filter shape calculateSafeToSpend.ts
//     already established (status='upcoming', dueDate/occurrence <=
//     horizon end; inactive/malformed recurring templates never forecast)
//   - isPastDue (features/obligations/lib/upcomingObligations.ts) for the
//     overdue determination below, rather than a third ad-hoc date compare
//
// Income: only a recurring_transactions template the household explicitly
// marked as income (positive amount_agorot — the same Chip toggle the
// Recurring screen's create form already exposes) becomes an inflow event.
// This is reading a structured, user-entered field, not inferring a salary
// from transaction history — no heuristic, no ML, nothing this engine
// "figures out" on its own. planned_obligations has no income concept at
// all (amount_agorot is unsigned — always an amount owed), so every
// obligation event is unconditionally an outflow.
//
// Overdue (still status='upcoming' but due_date/occurrence date before
// startDate) events are clamped to appear AT startDate, flagged `pastDue`
// (reusing upcomingObligations.ts's own naming rather than inventing a new
// term) — this is a deliberate divergence from how the obligations list
// screen itself displays an overdue item (at its true date, with a
// "· באיחור" label appended in place, never relocated): that screen is a
// flat list with no running total, so showing the true date is strictly
// more informative there. This engine walks a day-by-day balance starting
// at startDate — a liability that is already due and unpaid has nowhere
// valid to land on a chart whose x-axis begins at "today," and leaving it
// off the balance path entirely would make every day's projected balance
// silently wrong by that amount. Clamping to day 0 is both the milestone's
// own explicit instruction and the only way the running balance stays
// correct from the very first point. The event's `pastDue` flag is exactly
// what lets the UI still distinguish it, without misrepresenting the
// day-by-day math.
//
// Same-day aggregation (deterministic, order-independent): every event is
// grouped into the calendar day it lands on (after any overdue clamping)
// BEFORE that day's net inflow/outflow — and therefore its running balance
// — is computed. The daily walk never folds a flat, possibly-arbitrarily-
// ordered event array one event at a time; it always resolves a day's full
// event group first. Swapping the input order of two same-day events can
// never change any dailyPoint or summary figure.

import { forecastRecurringOccurrences, type RecurringForecastTemplate } from './forecastRecurringOccurrences'
import { forecastInstallmentOccurrences, type InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'
import { addDays } from './horizonRange'
import { isPastDue } from '@/features/obligations/lib/upcomingObligations'
import type { PlannedObligationForecastInput } from './calculateSafeToSpend'

export type CashFlowEventSource = 'planned_obligation' | 'recurring' | 'installment_plan'
export type CashFlowEventDirection = 'inflow' | 'outflow'

export interface CashFlowForecastEvent {
  // source + sourceId + the event's TRUE (pre-clamp) occurrence date —
  // always unique, even for two catch-up occurrences of the same recurring
  // template that both land on startDate after clamping.
  id: string
  // The date this event affects the running balance on — startDate when
  // pastDue, otherwise the real due_date/occurrence date.
  date: string
  // Always positive — a magnitude. direction carries the sign meaning.
  amountAgorot: number
  direction: CashFlowEventDirection
  source: CashFlowEventSource
  sourceId: string
  title: string
  pastDue: boolean
}

export interface CashFlowDailyPoint {
  date: string
  balanceAgorot: number
  inflowsAgorot: number
  outflowsAgorot: number
}

export interface CashFlowForecastInput {
  startingBalanceAgorot: number
  startDate: string
  endDate: string
  obligations: readonly PlannedObligationForecastInput[]
  recurringTemplates: readonly RecurringForecastTemplate[]
  installmentPlans: readonly InstallmentPlanForecastTemplate[]
}

export interface CashFlowForecastResult {
  startingBalanceAgorot: number
  endingBalanceAgorot: number
  totalInflowsAgorot: number
  totalOutflowsAgorot: number
  lowestBalanceAgorot: number
  lowestBalanceDate: string
  // null when the balance never dips below zero anywhere in the horizon.
  firstShortfallDate: string | null
  upcomingObligationsCount: number
  // Chronological, source+sourceId tie-break — same convention as
  // calculateSafeToSpend.ts's own `items`.
  events: CashFlowForecastEvent[]
  dailyPoints: CashFlowDailyPoint[]
}

function buildObligationEvents(
  obligations: readonly PlannedObligationForecastInput[],
  startDate: string,
  endDate: string
): CashFlowForecastEvent[] {
  return obligations
    .filter((o) => o.status === 'upcoming' && o.dueDate <= endDate)
    .map((o) => {
      const pastDue = isPastDue(o.dueDate, startDate)
      return {
        id: `planned_obligation:${o.id}:${o.dueDate}`,
        date: pastDue ? startDate : o.dueDate,
        amountAgorot: o.amountAgorot,
        direction: 'outflow' as const,
        source: 'planned_obligation' as const,
        sourceId: o.id,
        title: o.name,
        pastDue,
      }
    })
}

function buildRecurringEvents(
  recurringTemplates: readonly RecurringForecastTemplate[],
  startDate: string,
  endDate: string
): CashFlowForecastEvent[] {
  return forecastRecurringOccurrences(recurringTemplates, endDate).map((occurrence) => {
    const pastDue = isPastDue(occurrence.date, startDate)
    return {
      id: `recurring:${occurrence.recurringId}:${occurrence.date}`,
      date: pastDue ? startDate : occurrence.date,
      amountAgorot: Math.abs(occurrence.amountAgorot),
      direction: occurrence.amountAgorot < 0 ? ('outflow' as const) : ('inflow' as const),
      source: 'recurring' as const,
      sourceId: occurrence.recurringId,
      title: occurrence.description,
      pastDue,
    }
  })
}

function buildInstallmentEvents(
  installmentPlans: readonly InstallmentPlanForecastTemplate[],
  startDate: string,
  endDate: string
): CashFlowForecastEvent[] {
  return forecastInstallmentOccurrences(installmentPlans, endDate).map((occurrence) => {
    const pastDue = isPastDue(occurrence.date, startDate)
    return {
      id: `installment_plan:${occurrence.installmentPlanId}:${occurrence.date}`,
      date: pastDue ? startDate : occurrence.date,
      // Always negative on the forecaster's own contract (an instalment is
      // always an expense) — magnitude only, direction is always outflow.
      amountAgorot: Math.abs(occurrence.amountAgorot),
      direction: 'outflow' as const,
      source: 'installment_plan' as const,
      sourceId: occurrence.installmentPlanId,
      title: occurrence.description,
      pastDue,
    }
  })
}

export function calculateCashFlowForecast(input: CashFlowForecastInput): CashFlowForecastResult {
  const events = [
    ...buildObligationEvents(input.obligations, input.startDate, input.endDate),
    ...buildRecurringEvents(input.recurringTemplates, input.startDate, input.endDate),
    ...buildInstallmentEvents(input.installmentPlans, input.startDate, input.endDate),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId))

  // Group by (already-clamped) date first — the same-day aggregation
  // guarantee. A Map preserves nothing about input array order that the
  // sums below could accidentally depend on.
  const eventsByDate = new Map<string, CashFlowForecastEvent[]>()
  for (const event of events) {
    const list = eventsByDate.get(event.date)
    if (list) list.push(event)
    else eventsByDate.set(event.date, [event])
  }

  const dailyPoints: CashFlowDailyPoint[] = []
  let runningBalance = input.startingBalanceAgorot
  let lowestBalanceAgorot = input.startingBalanceAgorot
  let lowestBalanceDate = input.startDate
  let firstShortfallDate: string | null = null

  let cursor = input.startDate
  while (cursor <= input.endDate) {
    const dayEvents = eventsByDate.get(cursor) ?? []
    let inflowsAgorot = 0
    let outflowsAgorot = 0
    for (const event of dayEvents) {
      if (event.direction === 'inflow') inflowsAgorot += event.amountAgorot
      else outflowsAgorot += event.amountAgorot
    }

    runningBalance += inflowsAgorot - outflowsAgorot

    if (runningBalance < lowestBalanceAgorot) {
      lowestBalanceAgorot = runningBalance
      lowestBalanceDate = cursor
    }
    if (firstShortfallDate === null && runningBalance < 0) {
      firstShortfallDate = cursor
    }

    dailyPoints.push({ date: cursor, balanceAgorot: runningBalance, inflowsAgorot, outflowsAgorot })
    cursor = addDays(cursor, 1)
  }

  const totalInflowsAgorot = events.filter((e) => e.direction === 'inflow').reduce((sum, e) => sum + e.amountAgorot, 0)
  const totalOutflowsAgorot = events.filter((e) => e.direction === 'outflow').reduce((sum, e) => sum + e.amountAgorot, 0)
  const endingBalanceAgorot = dailyPoints[dailyPoints.length - 1]?.balanceAgorot ?? input.startingBalanceAgorot
  const upcomingObligationsCount = events.filter((e) => e.source === 'planned_obligation').length

  return {
    startingBalanceAgorot: input.startingBalanceAgorot,
    endingBalanceAgorot,
    totalInflowsAgorot,
    totalOutflowsAgorot,
    lowestBalanceAgorot,
    lowestBalanceDate,
    firstShortfallDate,
    upcomingObligationsCount,
    events,
    dailyPoints,
  }
}
