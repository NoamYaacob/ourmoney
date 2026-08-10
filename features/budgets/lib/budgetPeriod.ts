// Local-calendar-date month/period helpers. Deliberately never
// `new Date().toISOString()` (UTC) — Asia/Jerusalem is UTC+2/+3, so a UTC
// day boundary can show the wrong local day near midnight. Every function
// here reads local getters (getFullYear/getMonth/getDate) only.

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// The device's local calendar date as YYYY-MM-DD — the correct default for
// a new transaction's txn_date, and for "what month is today in."
export function localDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function getCurrentMonthPeriodStart(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-01`
}

// Last calendar day of periodStart's month, as YYYY-MM-DD, computed via
// local Date arithmetic (day 0 of the following month = last day of this
// month) — not string manipulation, so it is correct across 28/29/30/31-day
// months without a lookup table.
export function getPeriodEnd(periodStart: string): string {
  const [year, month] = periodStart.split('-').map(Number)
  const lastDay = new Date(year!, month!, 0)
  return localDateString(lastDay)
}

// The period_start (first of the month) that a given txn_date (already
// YYYY-MM-DD, e.g. from transactions.txn_date) belongs to — plain string
// slicing, not a new Date() parse, since the input is already an
// unambiguous calendar date with no timezone to get wrong.
export function getPeriodStartForDate(txnDate: string): string {
  return `${txnDate.slice(0, 7)}-01`
}

export function shiftMonth(periodStart: string, deltaMonths: number): string {
  const [year, month] = periodStart.split('-').map(Number)
  const shifted = new Date(year!, month! - 1 + deltaMonths, 1)
  return getCurrentMonthPeriodStart(shifted)
}
