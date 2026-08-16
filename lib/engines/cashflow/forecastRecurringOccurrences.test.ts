import { describe, expect, it } from '@jest/globals'
import { forecastRecurringOccurrences, type RecurringForecastTemplate } from './forecastRecurringOccurrences'

function template(overrides: Partial<RecurringForecastTemplate> = {}): RecurringForecastTemplate {
  return {
    id: 'rec-1',
    description: 'נטפליקס',
    amountAgorot: -7990,
    frequency: 'monthly',
    dayOfMonth: 15,
    nextDueDate: '2026-08-15',
    isActive: true,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    ...overrides,
  }
}

describe('forecastRecurringOccurrences', () => {
  it('returns a single occurrence when only one falls within the horizon', () => {
    const result = forecastRecurringOccurrences([template()], '2026-08-31')
    expect(result).toEqual([
      {
        recurringId: 'rec-1',
        description: 'נטפליקס',
        amountAgorot: -7990,
        date: '2026-08-15',
        categoryId: 'cat-1',
        accountId: 'acc-1',
      },
    ])
  })

  it('returns no occurrences when next_due_date is after the horizon end', () => {
    const result = forecastRecurringOccurrences([template({ nextDueDate: '2026-09-15' })], '2026-08-31')
    expect(result).toEqual([])
  })

  it('includes the occurrence when next_due_date exactly equals the horizon end (inclusive)', () => {
    const result = forecastRecurringOccurrences([template({ nextDueDate: '2026-08-31' })], '2026-08-31')
    expect(result).toHaveLength(1)
  })

  it('projects multiple occurrences of a weekly template within a 30-day horizon', () => {
    const result = forecastRecurringOccurrences(
      [template({ frequency: 'weekly', dayOfMonth: null, nextDueDate: '2026-08-01' })],
      '2026-08-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29'])
  })

  it('ignores an inactive template entirely', () => {
    const result = forecastRecurringOccurrences([template({ isActive: false })], '2026-12-31')
    expect(result).toEqual([])
  })

  it('includes an income (positive amount) recurring template — this primitive forecasts every sign', () => {
    const result = forecastRecurringOccurrences([template({ amountAgorot: 850000 })], '2026-08-31')
    expect(result).toHaveLength(1)
    expect(result[0]?.amountAgorot).toBe(850000)
  })

  it('reports the amount signed, exactly mirroring the source template (never negated or made absolute)', () => {
    const expense = forecastRecurringOccurrences([template({ amountAgorot: -45000 })], '2026-08-31')
    expect(expense[0]?.amountAgorot).toBe(-45000)
    const income = forecastRecurringOccurrences([template({ amountAgorot: 45000 })], '2026-08-31')
    expect(income[0]?.amountAgorot).toBe(45000)
  })

  it('handles a monthly template due on the 31st crossing into a 30-day month, then back to the 31st', () => {
    const result = forecastRecurringOccurrences(
      [template({ dayOfMonth: 31, nextDueDate: '2026-08-31' })],
      '2026-10-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2026-08-31', '2026-09-30', '2026-10-31'])
  })

  it('handles a monthly template due on the 31st crossing February in a leap year', () => {
    const result = forecastRecurringOccurrences(
      [template({ dayOfMonth: 31, nextDueDate: '2028-01-31' })],
      '2028-03-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2028-01-31', '2028-02-29', '2028-03-31'])
  })

  it('handles a monthly template due on the 31st crossing February in a non-leap year', () => {
    const result = forecastRecurringOccurrences(
      [template({ dayOfMonth: 31, nextDueDate: '2027-01-31' })],
      '2027-03-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })

  it('handles a yearly template', () => {
    const result = forecastRecurringOccurrences(
      [template({ frequency: 'yearly', dayOfMonth: 1, nextDueDate: '2026-08-01' })],
      '2027-12-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2026-08-01', '2027-08-01'])
  })

  it('does not double count an already-generated occurrence: next_due_date already advanced past it', () => {
    // If generation already ran for the 2026-08-15 occurrence, the template's
    // next_due_date is now 2026-09-15 — the forecast must start there, not
    // re-report the already-posted occurrence.
    const result = forecastRecurringOccurrences([template({ nextDueDate: '2026-09-15' })], '2026-09-30')
    expect(result.map((o) => o.date)).toEqual(['2026-09-15'])
  })

  it('does not cross-contaminate multiple independent recurring identities', () => {
    const netflix = template({ id: 'rec-netflix', description: 'נטפליקס', nextDueDate: '2026-08-05' })
    const internet = template({
      id: 'rec-internet',
      description: 'אינטרנט',
      amountAgorot: -15000,
      nextDueDate: '2026-08-18',
      dayOfMonth: 18,
    })
    const result = forecastRecurringOccurrences([netflix, internet], '2026-08-31')
    expect(result).toHaveLength(2)
    expect(result.find((o) => o.recurringId === 'rec-netflix')?.amountAgorot).toBe(-7990)
    expect(result.find((o) => o.recurringId === 'rec-internet')?.amountAgorot).toBe(-15000)
  })

  it('skips a malformed template (monthly frequency with a null dayOfMonth) instead of throwing', () => {
    // A real reachable data state: the recurring edit form does not always
    // set day_of_month when switching to a monthly/quarterly/yearly
    // frequency, so a row can exist with frequency='monthly' and
    // day_of_month=NULL. advanceDueDate throws for that combination — this
    // engine is the first render-path caller, so it must degrade this one
    // template rather than crash the whole app on every render.
    const malformed = template({ frequency: 'monthly', dayOfMonth: null })
    const healthy = template({ id: 'rec-2', description: 'ביטוח', dayOfMonth: 1, nextDueDate: '2026-08-01' })
    expect(() => forecastRecurringOccurrences([malformed, healthy], '2026-08-31')).not.toThrow()
    const result = forecastRecurringOccurrences([malformed, healthy], '2026-08-31')
    expect(result.map((o) => o.recurringId)).toEqual(['rec-2'])
  })

  it('skips a malformed quarterly/yearly template with a null dayOfMonth', () => {
    expect(
      forecastRecurringOccurrences([template({ frequency: 'quarterly', dayOfMonth: null })], '2026-12-31')
    ).toEqual([])
    expect(
      forecastRecurringOccurrences([template({ frequency: 'yearly', dayOfMonth: null })], '2027-12-31')
    ).toEqual([])
  })

  it('returns an empty array for an empty template list', () => {
    expect(forecastRecurringOccurrences([], '2026-12-31')).toEqual([])
  })

  it('handles a daily template producing several occurrences', () => {
    const result = forecastRecurringOccurrences(
      [template({ frequency: 'daily', dayOfMonth: null, nextDueDate: '2026-08-29' })],
      '2026-09-02'
    )
    expect(result.map((o) => o.date)).toEqual(['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'])
  })
})
