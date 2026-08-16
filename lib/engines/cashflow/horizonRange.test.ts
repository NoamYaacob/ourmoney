import { describe, expect, it } from '@jest/globals'
import { getDayRangeHorizon, getHorizonRange } from './horizonRange'

describe('getHorizonRange', () => {
  it('week: returns through Saturday of the current Israeli week (Sun-Sat)', () => {
    // 2026-08-16 is a Sunday.
    expect(getHorizonRange('week', '2026-08-16')).toEqual({ kind: 'week', start: '2026-08-16', end: '2026-08-22' })
  })

  it('week: a mid-week start still ends on the same Saturday', () => {
    // 2026-08-19 is a Wednesday.
    expect(getHorizonRange('week', '2026-08-19')).toEqual({ kind: 'week', start: '2026-08-19', end: '2026-08-22' })
  })

  it('week: today already being Saturday adds zero days', () => {
    expect(getHorizonRange('week', '2026-08-22')).toEqual({ kind: 'week', start: '2026-08-22', end: '2026-08-22' })
  })

  it('week: crosses a month boundary correctly', () => {
    // 2026-08-31 is a Monday; that week's Saturday is 2026-09-05.
    expect(getHorizonRange('week', '2026-08-31')).toEqual({ kind: 'week', start: '2026-08-31', end: '2026-09-05' })
  })

  it('month: returns through the last day of the current month', () => {
    expect(getHorizonRange('month', '2026-08-05')).toEqual({ kind: 'month', start: '2026-08-05', end: '2026-08-31' })
  })

  it('month: handles a 30-day month correctly', () => {
    expect(getHorizonRange('month', '2026-09-01')).toEqual({ kind: 'month', start: '2026-09-01', end: '2026-09-30' })
  })

  it('month: handles February in a non-leap year', () => {
    expect(getHorizonRange('month', '2027-02-10')).toEqual({ kind: 'month', start: '2027-02-10', end: '2027-02-28' })
  })

  it('month: handles February in a leap year', () => {
    expect(getHorizonRange('month', '2028-02-10')).toEqual({ kind: 'month', start: '2028-02-10', end: '2028-02-29' })
  })

  it('month: today already being the last day of the month returns the same date', () => {
    expect(getHorizonRange('month', '2026-08-31')).toEqual({ kind: 'month', start: '2026-08-31', end: '2026-08-31' })
  })

  it('days30: returns an inclusive 30-day window (today + 29 days)', () => {
    expect(getHorizonRange('days30', '2026-08-16')).toEqual({ kind: 'days30', start: '2026-08-16', end: '2026-09-14' })
  })

  it('days30: crosses a year boundary correctly', () => {
    expect(getHorizonRange('days30', '2026-12-10')).toEqual({ kind: 'days30', start: '2026-12-10', end: '2027-01-08' })
  })

  it('days30: handles a leap-year February within the window', () => {
    expect(getHorizonRange('days30', '2028-02-15')).toEqual({ kind: 'days30', start: '2028-02-15', end: '2028-03-15' })
  })

  it('defaults `today` to the current local date when omitted', () => {
    const range = getHorizonRange('month')
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(range.end >= range.start).toBe(true)
  })
})

describe('getDayRangeHorizon', () => {
  it('returns an inclusive 30-day window, matching getHorizonRange("days30") exactly', () => {
    expect(getDayRangeHorizon(30, '2026-08-16')).toEqual({ days: 30, start: '2026-08-16', end: '2026-09-14' })
    expect(getHorizonRange('days30', '2026-08-16').end).toBe(getDayRangeHorizon(30, '2026-08-16').end)
  })

  it('returns an inclusive 60-day window', () => {
    expect(getDayRangeHorizon(60, '2026-08-16')).toEqual({ days: 60, start: '2026-08-16', end: '2026-10-14' })
  })

  it('returns an inclusive 90-day window', () => {
    expect(getDayRangeHorizon(90, '2026-08-16')).toEqual({ days: 90, start: '2026-08-16', end: '2026-11-13' })
  })

  it('is not hardcoded to 30/60/90 — accepts any day count', () => {
    expect(getDayRangeHorizon(7, '2026-08-16')).toEqual({ days: 7, start: '2026-08-16', end: '2026-08-22' })
    expect(getDayRangeHorizon(1, '2026-08-16')).toEqual({ days: 1, start: '2026-08-16', end: '2026-08-16' })
  })

  it('crosses a year boundary correctly', () => {
    expect(getDayRangeHorizon(90, '2026-12-01')).toEqual({ days: 90, start: '2026-12-01', end: '2027-02-28' })
  })

  it('handles a leap-year February within the window', () => {
    expect(getDayRangeHorizon(60, '2028-01-15')).toEqual({ days: 60, start: '2028-01-15', end: '2028-03-14' })
  })

  it('defaults `today` to the current local date when omitted', () => {
    const range = getDayRangeHorizon(30)
    expect(range.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(range.end >= range.start).toBe(true)
  })
})
