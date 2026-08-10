import { describe, expect, it } from '@jest/globals'
import { getCurrentMonthPeriodStart, getPeriodEnd, getPeriodStartForDate, localDateString, shiftMonth } from './budgetPeriod'

describe('localDateString', () => {
  it('formats a local date as YYYY-MM-DD, zero-padded', () => {
    expect(localDateString(new Date(2026, 0, 5, 10, 0, 0))).toBe('2026-01-05')
  })

  it('never crosses a day boundary via UTC — 23:30 local on the last day of a month stays that day', () => {
    // Local 2026-08-31 23:30 — a UTC-based formatter (toISOString) in a
    // negative-UTC-offset zone would show this as September 1st. This must
    // never happen here, regardless of the test runner's TZ, because this
    // function never touches UTC getters.
    const lateNight = new Date(2026, 7, 31, 23, 30, 0)
    expect(localDateString(lateNight)).toBe('2026-08-31')
  })
})

describe('getCurrentMonthPeriodStart', () => {
  it('returns the first of the given date\'s local month', () => {
    expect(getCurrentMonthPeriodStart(new Date(2026, 7, 31, 23, 30, 0))).toBe('2026-08-01')
  })

  it('pads single-digit months', () => {
    expect(getCurrentMonthPeriodStart(new Date(2026, 0, 15))).toBe('2026-01-01')
  })
})

describe('getPeriodEnd', () => {
  it('resolves the last day of a 31-day month', () => {
    expect(getPeriodEnd('2026-08-01')).toBe('2026-08-31')
  })

  it('resolves the last day of a 30-day month', () => {
    expect(getPeriodEnd('2026-04-01')).toBe('2026-04-30')
  })

  it('resolves February in a non-leap year', () => {
    expect(getPeriodEnd('2026-02-01')).toBe('2026-02-28')
  })

  it('resolves February in a leap year', () => {
    expect(getPeriodEnd('2028-02-01')).toBe('2028-02-29')
  })

  it('resolves December correctly (year rollover)', () => {
    expect(getPeriodEnd('2026-12-01')).toBe('2026-12-31')
  })
})

describe('getPeriodStartForDate', () => {
  it('resolves the first of the month for a mid-month date', () => {
    expect(getPeriodStartForDate('2026-08-17')).toBe('2026-08-01')
  })

  it('resolves the first of the month for the last day of the month', () => {
    expect(getPeriodStartForDate('2026-08-31')).toBe('2026-08-01')
  })
})

describe('shiftMonth', () => {
  it('moves forward one month', () => {
    expect(shiftMonth('2026-08-01', 1)).toBe('2026-09-01')
  })

  it('moves backward one month', () => {
    expect(shiftMonth('2026-08-01', -1)).toBe('2026-07-01')
  })

  it('rolls over a year forward', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
  })

  it('rolls over a year backward', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
  })
})
