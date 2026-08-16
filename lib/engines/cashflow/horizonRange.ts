// Pure date-range helpers for the Safe-to-Spend engine's selectable
// horizons. Local-calendar-date arithmetic only (getFullYear/getMonth/
// getDate getters), never `new Date().toISOString()` — same reasoning as
// features/budgets/lib/budgetPeriod.ts's own header comment: Asia/Jerusalem
// is UTC+2/+3, so a UTC day boundary can show the wrong local day near
// midnight. 'month' reuses that file's own getCurrentMonthPeriodStart/
// getPeriodEnd rather than re-deriving month-end day-count logic here.
//
// `start` is always `today` — every horizon in this feature means "from
// right now through some future point," never a window with its own
// distinct start. It is still a field on the returned range (not just an
// implicit constant) purely for display (the detail screen's own horizon
// label) — no filtering logic in this engine lower-bounds on it. An
// obligation due_date before `start` (an overdue-but-still-unpaid
// obligation, status still 'upcoming') is deliberately NOT excluded by a
// `start` lower bound anywhere downstream — money still owed and not yet
// paid is exactly as reserved as money due next week, arguably more so.

import { getPeriodEnd, getPeriodStartForDate, localDateString } from '@/features/budgets/lib/budgetPeriod'

export type HorizonKind = 'week' | 'month' | 'days30'

export interface HorizonRange {
  kind: HorizonKind
  start: string
  end: string
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number]
  const next = new Date(year, month - 1, day + days)
  return localDateString(next)
}

// Israeli week: Sunday (0) through Saturday (6) — "עד סוף השבוע" means
// through this Saturday, inclusive, even when today already is Saturday
// (0 days to add).
function endOfWeek(today: string): string {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number]
  const dayOfWeek = new Date(year, month - 1, day).getDay()
  return addDays(today, 6 - dayOfWeek)
}

export function getHorizonRange(kind: HorizonKind, today: string = localDateString()): HorizonRange {
  switch (kind) {
    case 'week':
      return { kind, start: today, end: endOfWeek(today) }
    case 'month':
      return { kind, start: today, end: getPeriodEnd(getPeriodStartForDate(today)) }
    case 'days30':
      // Inclusive 30-day window: today plus the next 29 days.
      return { kind, start: today, end: addDays(today, 29) }
  }
}
