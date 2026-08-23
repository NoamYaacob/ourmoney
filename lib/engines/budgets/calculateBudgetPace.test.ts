import { describe, expect, it } from '@jest/globals'
import { calculateBudgetPace, type BudgetPaceInput } from './calculateBudgetPace'

function baseInput(overrides: Partial<BudgetPaceInput> = {}): BudgetPaceInput {
  return {
    allocatedAgorot: 300000,
    spentAgorot: 60000,
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    today: '2026-08-10',
    ...overrides,
  }
}

describe('calculateBudgetPace', () => {
  it('returns null when there is no budget allocated (nothing to project against)', () => {
    expect(calculateBudgetPace(baseInput({ allocatedAgorot: 0 }))).toBeNull()
  })

  it('returns null for a negative allocation (should never occur, but is not a valid projection base)', () => {
    expect(calculateBudgetPace(baseInput({ allocatedAgorot: -100 }))).toBeNull()
  })

  it('returns null on the first day of the month (too little data to average)', () => {
    expect(calculateBudgetPace(baseInput({ today: '2026-08-01' }))).toBeNull()
  })

  it('returns null on the second day of the month', () => {
    expect(calculateBudgetPace(baseInput({ today: '2026-08-02' }))).toBeNull()
  })

  it('starts projecting once the minimum elapsed-days threshold is reached', () => {
    const result = calculateBudgetPace(baseInput({ today: '2026-08-03', spentAgorot: 30000 }))
    expect(result).not.toBeNull()
    expect(result?.daysElapsed).toBe(3)
  })

  it('returns null when viewing a past month (already over, nothing left to project)', () => {
    expect(calculateBudgetPace(baseInput({ today: '2026-09-05' }))).toBeNull()
  })

  it('returns null when viewing a future month (no spend yet to extrapolate from)', () => {
    expect(calculateBudgetPace(baseInput({ today: '2026-07-05' }))).toBeNull()
  })

  it('projects a plain 0 (not null) for zero spend so far, once past the minimum-days threshold', () => {
    const result = calculateBudgetPace(baseInput({ spentAgorot: 0 }))
    expect(result).not.toBeNull()
    expect(result?.dailyPaceAgorot).toBe(0)
    expect(result?.projectedEndOfMonthAgorot).toBe(0)
    expect(result?.isProjectedOverspend).toBe(false)
  })

  it('projects a linear extrapolation of the average daily spend across the full month', () => {
    // 10 days elapsed of 31, spent 100000 agorot -> 10000/day -> 310000 projected
    const result = calculateBudgetPace(baseInput({ today: '2026-08-10', spentAgorot: 100000 }))
    expect(result?.daysElapsed).toBe(10)
    expect(result?.daysInMonth).toBe(31)
    expect(result?.dailyPaceAgorot).toBe(10000)
    expect(result?.projectedEndOfMonthAgorot).toBe(310000)
  })

  it('flags a projected overspend with the correct positive magnitude', () => {
    const result = calculateBudgetPace(baseInput({ allocatedAgorot: 300000, spentAgorot: 150000, today: '2026-08-10' }))
    // pace 15000/day * 31 = 465000 projected, 165000 over the 300000 allocation
    expect(result?.projectedEndOfMonthAgorot).toBe(465000)
    expect(result?.isProjectedOverspend).toBe(true)
    expect(result?.projectedOverspendAgorot).toBe(165000)
  })

  it('reports zero overspend (not a negative figure) when the projection is under the allocation', () => {
    const result = calculateBudgetPace(baseInput({ allocatedAgorot: 300000, spentAgorot: 30000, today: '2026-08-10' }))
    expect(result?.isProjectedOverspend).toBe(false)
    expect(result?.projectedOverspendAgorot).toBe(0)
  })

  it('an already-overspent budget always projects a positive overspend, even late in the month', () => {
    const result = calculateBudgetPace(
      baseInput({ allocatedAgorot: 300000, spentAgorot: 350000, today: '2026-08-30' })
    )
    expect(result?.isProjectedOverspend).toBe(true)
    expect(result?.projectedOverspendAgorot).toBeGreaterThan(0)
  })

  it('converges toward the actual spent total on the last day of the month', () => {
    const result = calculateBudgetPace(baseInput({ today: '2026-08-31', spentAgorot: 280000 }))
    expect(result?.daysElapsed).toBe(31)
    expect(result?.daysInMonth).toBe(31)
    expect(result?.projectedEndOfMonthAgorot).toBe(280000)
  })

  it('handles a shorter month (February) correctly', () => {
    const result = calculateBudgetPace(
      baseInput({ periodStart: '2026-02-01', periodEnd: '2026-02-28', today: '2026-02-14', spentAgorot: 140000 })
    )
    expect(result?.daysInMonth).toBe(28)
    expect(result?.daysElapsed).toBe(14)
    expect(result?.dailyPaceAgorot).toBe(10000)
    expect(result?.projectedEndOfMonthAgorot).toBe(280000)
  })

  it('handles a leap-year February correctly', () => {
    const result = calculateBudgetPace(
      baseInput({ periodStart: '2028-02-01', periodEnd: '2028-02-29', today: '2028-02-29', spentAgorot: 290000 })
    )
    expect(result?.daysInMonth).toBe(29)
    expect(result?.daysElapsed).toBe(29)
  })

  it('produces only integer agorot in every numeric field', () => {
    const result = calculateBudgetPace(baseInput({ allocatedAgorot: 300001, spentAgorot: 100001, today: '2026-08-11' }))
    for (const value of [
      result!.dailyPaceAgorot,
      result!.projectedEndOfMonthAgorot,
      result!.projectedOverspendAgorot,
    ]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})
