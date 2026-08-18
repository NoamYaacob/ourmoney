import { describe, expect, it } from '@jest/globals'
import { filterUpcomingObligations, isPastDue } from './upcomingObligations'

describe('filterUpcomingObligations', () => {
  it('sorts by nearest due date first', () => {
    const obligations = [
      { id: 'c', dueDate: '2027-02-03', status: 'upcoming' as const },
      { id: 'a', dueDate: '2026-09-10', status: 'upcoming' as const },
      { id: 'b', dueDate: '2026-11-15', status: 'upcoming' as const },
    ]

    expect(filterUpcomingObligations(obligations).map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('excludes completed obligations from the upcoming list', () => {
    const obligations = [
      { id: 'a', dueDate: '2026-09-10', status: 'upcoming' as const },
      { id: 'b', dueDate: '2026-08-01', status: 'completed' as const },
    ]

    expect(filterUpcomingObligations(obligations).map((o) => o.id)).toEqual(['a'])
  })

  it('excludes cancelled obligations from the upcoming list', () => {
    const obligations = [
      { id: 'a', dueDate: '2026-09-10', status: 'upcoming' as const },
      { id: 'b', dueDate: '2026-08-01', status: 'cancelled' as const },
    ]

    expect(filterUpcomingObligations(obligations).map((o) => o.id)).toEqual(['a'])
  })

  it('returns an empty list when there are no upcoming obligations', () => {
    expect(filterUpcomingObligations([])).toEqual([])
  })

  it('correctly orders across a year boundary', () => {
    const obligations = [
      { id: 'next-year', dueDate: '2027-01-05', status: 'upcoming' as const },
      { id: 'this-year', dueDate: '2026-12-20', status: 'upcoming' as const },
    ]

    expect(filterUpcomingObligations(obligations).map((o) => o.id)).toEqual(['this-year', 'next-year'])
  })

  it('does not mutate the input array', () => {
    const obligations = [
      { id: 'b', dueDate: '2026-11-15', status: 'upcoming' as const },
      { id: 'a', dueDate: '2026-09-10', status: 'upcoming' as const },
    ]
    const original = [...obligations]

    filterUpcomingObligations(obligations)

    expect(obligations).toEqual(original)
  })
})

describe('isPastDue', () => {
  it('is true for a due date before today', () => {
    expect(isPastDue('2026-08-01', '2026-08-16')).toBe(true)
  })

  it('is false for a due date today', () => {
    expect(isPastDue('2026-08-16', '2026-08-16')).toBe(false)
  })

  it('is false for a due date in the future', () => {
    expect(isPastDue('2026-09-10', '2026-08-16')).toBe(false)
  })

  it('handles a year boundary correctly', () => {
    expect(isPastDue('2026-12-31', '2027-01-01')).toBe(true)
    expect(isPastDue('2027-01-01', '2026-12-31')).toBe(false)
  })
})
