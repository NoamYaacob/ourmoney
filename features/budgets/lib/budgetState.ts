// One answer to "how is this budget doing", used by every surface that
// asks: the Home block, the Budget screen's summary, and each category row.
//
// It exists because those three were each deriving it themselves, and a
// household that sees "בקצב" on Home and "מתקרב לגבול" on the Budget screen
// for the same month has been told two different things about one fact.
//
// Three states, in the design's own words:
//
//   healthy      spending is inside the allocation and the month-end
//                projection stays there
//   approaching  still inside the allocation, but the current pace lands
//                over it by month end — this is the state the design
//                added amber for, so red is left to mean something
//   over         already spent past the allocation
//
// Deliberately built on top of calculateBudgetPace rather than beside it:
// the projection is that engine's, and this only classifies it. When the
// engine declines to project (too few days elapsed to extrapolate from),
// `approaching` is unreachable and the state falls back to the plain
// spent-vs-allocated fact — a guess is not offered in place of the data.

import { calculateBudgetPace } from '@/lib/engines/budgets/calculateBudgetPace'

export type BudgetState = 'healthy' | 'approaching' | 'over'

export interface BudgetStateResult {
  state: BudgetState
  // 0..n, may exceed 100. Null when there is no allocation to divide by,
  // which callers render as "no budget set" rather than as 0%.
  percentSpent: number | null
  // 0..100 — how far through the period today is, for the bar's pace
  // marker. Null whenever the engine declined to project.
  pacePercent: number | null
  // Positive magnitude of the projected overshoot, 0 when none.
  projectedOverspendAgorot: number
  hasProjection: boolean
}

export interface BudgetStateInput {
  allocatedAgorot: number
  spentAgorot: number
  periodStart: string
  periodEnd: string
  today: string
}

export function budgetState(input: BudgetStateInput): BudgetStateResult {
  const { allocatedAgorot, spentAgorot } = input

  if (allocatedAgorot <= 0) {
    return {
      state: 'healthy',
      percentSpent: null,
      pacePercent: null,
      projectedOverspendAgorot: 0,
      hasProjection: false,
    }
  }

  const pace = calculateBudgetPace(input)
  // Integer cross-multiplication, never a float ratio — the same discipline
  // lib/money/arithmetic.ts's spentPercent applies.
  const percentSpent = Math.floor((spentAgorot * 100) / allocatedAgorot)

  const state: BudgetState =
    spentAgorot > allocatedAgorot ? 'over' : pace?.isProjectedOverspend ? 'approaching' : 'healthy'

  return {
    state,
    percentSpent,
    pacePercent: pace ? Math.round((pace.daysElapsed * 100) / pace.daysInMonth) : null,
    projectedOverspendAgorot: pace?.projectedOverspendAgorot ?? 0,
    hasProjection: pace !== null,
  }
}

// The chip wording and the StatusChip tone for a state. Kept next to the
// classifier so a new state cannot be added without deciding how it reads.
export const BUDGET_STATE_LABEL_KEY: Record<BudgetState, string> = {
  healthy: 'budgets.state.onTrack',
  approaching: 'budgets.state.approaching',
  over: 'budgets.state.over',
}

export const BUDGET_STATE_TONE: Record<BudgetState, 'positive' | 'warning' | 'danger'> = {
  healthy: 'positive',
  approaching: 'warning',
  over: 'danger',
}
