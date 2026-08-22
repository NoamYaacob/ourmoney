import { describe, expect, it } from '@jest/globals'
import { budgetState } from './budgetState'

// A full month, with "today" mid-way through it so the pace engine has
// enough elapsed days to extrapolate from.
const PERIOD = { periodStart: '2026-08-01', periodEnd: '2026-08-31' }

describe('budgetState', () => {
  it('reports no state at all without an allocation', () => {
    const result = budgetState({ ...PERIOD, today: '2026-08-15', allocatedAgorot: 0, spentAgorot: 12_000 })

    // A household with no budget must not be shown a percentage of one.
    expect(result.percentSpent).toBeNull()
    expect(result.pacePercent).toBeNull()
    expect(result.hasProjection).toBe(false)
  })

  it('is healthy when spending is inside the allocation and stays there', () => {
    // 400,000 of 1,000,000 by the 15th projects to ~826,000 by month end.
    const result = budgetState({ ...PERIOD, today: '2026-08-15', allocatedAgorot: 1_000_000, spentAgorot: 400_000 })

    expect(result.state).toBe('healthy')
    expect(result.percentSpent).toBe(40)
    expect(result.projectedOverspendAgorot).toBe(0)
  })

  it('is approaching when the allocation still holds but the pace does not', () => {
    // 700,000 of 1,000,000 by the 15th projects well past the allocation,
    // while the household is still inside it today. This is the state the
    // design added amber for, so red keeps meaning a real overrun.
    const result = budgetState({ ...PERIOD, today: '2026-08-15', allocatedAgorot: 1_000_000, spentAgorot: 700_000 })

    expect(result.state).toBe('approaching')
    expect(result.projectedOverspendAgorot).toBeGreaterThan(0)
  })

  it('is over once spending passes the allocation, regardless of pace', () => {
    const result = budgetState({ ...PERIOD, today: '2026-08-15', allocatedAgorot: 1_000_000, spentAgorot: 1_200_000 })

    expect(result.state).toBe('over')
    expect(result.percentSpent).toBe(120)
  })

  it('offers no projection on day one — and therefore never guesses "approaching"', () => {
    const result = budgetState({ ...PERIOD, today: '2026-08-01', allocatedAgorot: 1_000_000, spentAgorot: 900_000 })

    expect(result.hasProjection).toBe(false)
    expect(result.pacePercent).toBeNull()
    // Still inside the allocation, and with no projection to lean on the
    // state falls back to the plain fact rather than an extrapolation from
    // a single day.
    expect(result.state).toBe('healthy')
  })

  it('offers no projection for a month that is not the current one', () => {
    const past = budgetState({ ...PERIOD, today: '2026-09-15', allocatedAgorot: 1_000_000, spentAgorot: 400_000 })
    expect(past.hasProjection).toBe(false)
  })

  it('places the pace marker by how far through the period today is', () => {
    const result = budgetState({ ...PERIOD, today: '2026-08-16', allocatedAgorot: 1_000_000, spentAgorot: 400_000 })

    // 16 of 31 days.
    expect(result.pacePercent).toBe(52)
  })

  it('reports a percent above 100 rather than clamping it', () => {
    // The bar clamps for display; the classifier must not, or "how far
    // over" would be lost before anything could say it.
    const result = budgetState({ ...PERIOD, today: '2026-08-15', allocatedAgorot: 100_000, spentAgorot: 250_000 })
    expect(result.percentSpent).toBe(250)
  })
})
