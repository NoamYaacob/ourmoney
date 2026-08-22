// End-of-month budget projection ("spending pace") — deterministic, no AI
// (CLAUDE.md § Deterministic Financial Logic vs. AI / ADR-012). Reuses the
// exact totals useBudgetProgress.ts already computes from canonical
// transactions; this is a pure extrapolation of those two numbers plus the
// calendar, never a second budget engine and never a new data source.
//
// The math: dailyPaceAgorot = totalSpentAgorot / daysElapsed (average spend
// per day so far this month), projectedEndOfMonthAgorot = dailyPaceAgorot *
// daysInMonth (linear extrapolation of that average across the full
// month). A transient float division happens inside the extrapolation —
// the same "compute with a float, Math.round back to an integer agorot
// immediately, never store or compare the float" discipline
// lib/money/format.ts's agorotFromILS already uses for parsing user input.
//
// "Hide instead of inventing precision" is the guiding rule, not a
// nice-to-have — every one of these is a real reason the projection would
// mislead rather than inform, so this returns null (never a fabricated
// number) when:
//   - there is no budget allocated to project against (allocatedAgorot <= 0)
//   - today falls outside the period being viewed (a past month has
//     already ended — there is nothing left to "project"; a future month
//     has no spend yet to extrapolate from)
//   - fewer than MIN_DAYS_ELAPSED_FOR_PROJECTION days of the period have
//     passed — a single early purchase can make day 1 or 2's "average"
//     wildly unrepresentative of the rest of the month

const MIN_DAYS_ELAPSED_FOR_PROJECTION = 3

export interface BudgetPaceInput {
  allocatedAgorot: number
  spentAgorot: number
  periodStart: string
  periodEnd: string
  today: string
}

export interface BudgetPaceResult {
  daysElapsed: number
  daysInMonth: number
  dailyPaceAgorot: number
  projectedEndOfMonthAgorot: number
  // Always >= 0 — 0 when the projection is at or under the allocation, the
  // positive overshoot magnitude otherwise. Never a signed/negative field a
  // caller could misread as "under budget by X" (that's just
  // remainingAgorot, already computed elsewhere).
  projectedOverspendAgorot: number
  isProjectedOverspend: boolean
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  const [sy, sm, sd] = startIso.split('-').map(Number) as [number, number, number]
  const [ey, em, ed] = endIso.split('-').map(Number) as [number, number, number]
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
}

export function calculateBudgetPace(input: BudgetPaceInput): BudgetPaceResult | null {
  if (input.allocatedAgorot <= 0) return null
  if (input.today < input.periodStart || input.today > input.periodEnd) return null

  const daysElapsed = daysBetweenInclusive(input.periodStart, input.today)
  const daysInMonth = daysBetweenInclusive(input.periodStart, input.periodEnd)
  if (daysElapsed < MIN_DAYS_ELAPSED_FOR_PROJECTION) return null

  const dailyPaceAgorot = Math.round(input.spentAgorot / daysElapsed)
  const projectedEndOfMonthAgorot = Math.round((input.spentAgorot * daysInMonth) / daysElapsed)
  const projectedOverspendAgorot = Math.max(0, projectedEndOfMonthAgorot - input.allocatedAgorot)

  return {
    daysElapsed,
    daysInMonth,
    dailyPaceAgorot,
    projectedEndOfMonthAgorot,
    projectedOverspendAgorot,
    isProjectedOverspend: projectedOverspendAgorot > 0,
  }
}
