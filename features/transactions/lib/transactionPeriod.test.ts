import { describe, expect, it } from '@jest/globals'
import { getPeriodRange } from './transactionPeriod'

// Fixed "now" — 2026-08-16 (a Sunday), mid-month, mid-year — chosen so
// month-boundary and year-boundary arithmetic is exercised, not
// accidentally hidden by picking the 1st or 31st.
const NOW = new Date(2026, 7, 16) // August 16, 2026 (0-indexed month)

describe('getPeriodRange', () => {
  it('all_time has no date bounds at all', () => {
    expect(getPeriodRange('all_time', NOW)).toEqual({ periodStart: null, periodEnd: null })
  })

  it('current_month is the full current calendar month', () => {
    expect(getPeriodRange('current_month', NOW)).toEqual({ periodStart: '2026-08-01', periodEnd: '2026-08-31' })
  })

  it('previous_month is the full preceding calendar month', () => {
    expect(getPeriodRange('previous_month', NOW)).toEqual({ periodStart: '2026-07-01', periodEnd: '2026-07-31' })
  })

  it('previous_month correctly crosses a year boundary in January', () => {
    const jan = new Date(2026, 0, 10)
    expect(getPeriodRange('previous_month', jan)).toEqual({ periodStart: '2025-12-01', periodEnd: '2025-12-31' })
  })

  it('last_3_months spans the current month and the 2 preceding, ending at end of current month', () => {
    expect(getPeriodRange('last_3_months', NOW)).toEqual({ periodStart: '2026-06-01', periodEnd: '2026-08-31' })
  })

  it('last_6_months spans the current month and the 5 preceding', () => {
    expect(getPeriodRange('last_6_months', NOW)).toEqual({ periodStart: '2026-03-01', periodEnd: '2026-08-31' })
  })

  it('last_3_months correctly crosses a year boundary', () => {
    const feb = new Date(2026, 1, 5) // February
    expect(getPeriodRange('last_3_months', feb)).toEqual({ periodStart: '2025-12-01', periodEnd: '2026-02-28' })
  })

  it('current_year is Jan 1 through Dec 31 of the current year', () => {
    expect(getPeriodRange('current_year', NOW)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31' })
  })

  it('current_month correctly computes the last day of a 28-day February', () => {
    const feb = new Date(2026, 1, 10)
    expect(getPeriodRange('current_month', feb)).toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28' })
  })

  it('current_month correctly computes the last day of a 29-day leap February', () => {
    const leapFeb = new Date(2028, 1, 10)
    expect(getPeriodRange('current_month', leapFeb)).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' })
  })
})
