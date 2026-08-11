import { describe, expect, it } from '@jest/globals'
import { advanceDueDate, previewDueOccurrences } from './recurringDueDate'

describe('advanceDueDate', () => {
  it('daily advances by exactly 1 day', () => {
    expect(advanceDueDate('2026-01-31', 'daily', null)).toBe('2026-02-01')
  })

  it('weekly advances by exactly 7 days', () => {
    expect(advanceDueDate('2026-01-28', 'weekly', null)).toBe('2026-02-04')
  })

  it('biweekly advances by exactly 14 days', () => {
    expect(advanceDueDate('2026-01-28', 'biweekly', null)).toBe('2026-02-11')
  })

  it('monthly: 31st clamps to Feb 28 in a non-leap year', () => {
    // 2026 is not a leap year.
    expect(advanceDueDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28')
  })

  it('monthly: 31st clamps to Feb 29 in a leap year', () => {
    // 2028 is a leap year.
    expect(advanceDueDate('2028-01-31', 'monthly', 31)).toBe('2028-02-29')
  })

  it('monthly: 31st clamps to the 30th in a 30-day month', () => {
    expect(advanceDueDate('2026-03-31', 'monthly', 31)).toBe('2026-04-30')
  })

  it('monthly: re-derives from the ORIGINAL dayOfMonth, not the previous due date — no permanent drift after a short month', () => {
    // Jan 31 -> Feb 28 (clamped) -> the NEXT advance must use dayOfMonth=31
    // again, landing back on March 31, not March 28.
    const afterFeb = advanceDueDate('2026-01-31', 'monthly', 31)
    expect(afterFeb).toBe('2026-02-28')
    const afterMarch = advanceDueDate(afterFeb, 'monthly', 31)
    expect(afterMarch).toBe('2026-03-31')
  })

  it('quarterly clamps across a 3-month step landing on a 30-day month', () => {
    // Jan 31 + 3 months = April (30 days).
    expect(advanceDueDate('2026-01-31', 'quarterly', 31)).toBe('2026-04-30')
  })

  it('yearly clamps a leap-day (Feb 29) template in a non-leap target year', () => {
    expect(advanceDueDate('2028-02-29', 'yearly', 29)).toBe('2029-02-28')
  })

  it('monthly/quarterly/yearly throw if dayOfMonth is null (a data invariant violation, not a silent guess)', () => {
    expect(() => advanceDueDate('2026-01-31', 'monthly', null)).toThrow()
    expect(() => advanceDueDate('2026-01-31', 'quarterly', null)).toThrow()
    expect(() => advanceDueDate('2026-01-31', 'yearly', null)).toThrow()
  })
})

describe('previewDueOccurrences', () => {
  it('returns a single occurrence when only one period is due', () => {
    const occurrences = previewDueOccurrences(
      { id: 't1', dueDate: '2026-08-01', frequency: 'monthly', dayOfMonth: 1 },
      '2026-08-11'
    )
    expect(occurrences).toEqual(['2026-08-01'])
  })

  it('returns nothing when the next due date is in the future', () => {
    const occurrences = previewDueOccurrences(
      { id: 't1', dueDate: '2026-09-01', frequency: 'monthly', dayOfMonth: 1 },
      '2026-08-11'
    )
    expect(occurrences).toEqual([])
  })

  it('catches up multiple missed months without permanent day-of-month drift', () => {
    const occurrences = previewDueOccurrences(
      { id: 't1', dueDate: '2026-05-31', frequency: 'monthly', dayOfMonth: 31 },
      '2026-08-11'
    )
    // May 31 -> Jun 30 (clamped) -> Jul 31 (re-derived from 31, not from 30)
    // -> Aug 31 would be next, which is after today (Aug 11), so it stops.
    expect(occurrences).toEqual(['2026-05-31', '2026-06-30', '2026-07-31'])
  })
})
