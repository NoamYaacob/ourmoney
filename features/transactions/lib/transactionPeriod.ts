// Local-calendar-date period helpers for the Transactions list filter.
// Deliberately never `new Date().toISOString()` (UTC) — Asia/Jerusalem is
// UTC+2/+3, so a UTC day boundary can show the wrong local day near
// midnight. Every function here reads local getters
// (getFullYear/getMonth/getDate) only. Self-contained (not imported from
// features/budgets/lib/budgetPeriod.ts) — this milestone's scope guard
// says not to touch budgets/, and the two features' period concepts are
// allowed to diverge (budgets is month-only; this is six named ranges).

export type TransactionPeriod = 'current_month' | 'previous_month' | 'last_3_months' | 'last_6_months' | 'current_year' | 'all_time'

export const TRANSACTION_PERIODS: readonly TransactionPeriod[] = [
  'current_month',
  'previous_month',
  'last_3_months',
  'last_6_months',
  'current_year',
  'all_time',
]

export interface PeriodRange {
  // Both null for 'all_time' — no date predicate at all, matching this
  // screen's behavior before this milestone (unfiltered by date).
  periodStart: string | null
  periodEnd: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function firstOfMonth(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`
}

// Day 0 of the following month = the last day of `date`'s month — correct
// across 28/29/30/31-day months without a lookup table.
function lastOfMonth(date: Date): string {
  return localDateString(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

function shiftMonths(date: Date, deltaMonths: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + deltaMonths, 1)
}

export function getPeriodRange(period: TransactionPeriod, now: Date = new Date()): PeriodRange {
  switch (period) {
    case 'all_time':
      return { periodStart: null, periodEnd: null }
    case 'current_month':
      return { periodStart: firstOfMonth(now), periodEnd: lastOfMonth(now) }
    case 'previous_month': {
      const prev = shiftMonths(now, -1)
      return { periodStart: firstOfMonth(prev), periodEnd: lastOfMonth(prev) }
    }
    case 'last_3_months':
      // Current month plus the 2 preceding — 3 calendar months total,
      // ending at the end of the current month.
      return { periodStart: firstOfMonth(shiftMonths(now, -2)), periodEnd: lastOfMonth(now) }
    case 'last_6_months':
      return { periodStart: firstOfMonth(shiftMonths(now, -5)), periodEnd: lastOfMonth(now) }
    case 'current_year':
      return { periodStart: `${now.getFullYear()}-01-01`, periodEnd: `${now.getFullYear()}-12-31` }
  }
}
