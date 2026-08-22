import { describe, expect, it } from '@jest/globals'
import { calculateSavingsPace, type SavingsPaceInput } from './calculateSavingsPace'

function baseInput(overrides: Partial<SavingsPaceInput> = {}): SavingsPaceInput {
  return {
    currentAgorot: 200000,
    targetAgorot: 800000,
    targetDate: '2026-12-01',
    today: '2026-08-22',
    ...overrides,
  }
}

describe('calculateSavingsPace', () => {
  it('returns null when the goal has no target date — nothing to project a monthly figure against', () => {
    expect(calculateSavingsPace(baseInput({ targetDate: null }))).toBeNull()
  })

  it('computes the remaining amount and a ceil-rounded required monthly saving', () => {
    // remaining 600000, Aug 22 -> Dec 1 is 3 months (Sep, Oct, Nov -> gd(1) < td(22) so -1: (12-8)=4, -1=3)
    const result = calculateSavingsPace(baseInput())
    expect(result?.remainingAgorot).toBe(600000)
    expect(result?.monthsRemaining).toBe(3)
    expect(result?.requiredMonthlyAgorot).toBe(200000)
    expect(result?.isOverdue).toBe(false)
    expect(result?.isOnTrack).toBe(true)
  })

  it('rounds the required monthly amount UP (never undershoots) when it does not divide evenly', () => {
    const result = calculateSavingsPace(baseInput({ currentAgorot: 0, targetAgorot: 100000, targetDate: '2026-11-22' }))
    // 3 months remaining, 100000/3 = 33333.33 -> ceil to 33334
    expect(result?.monthsRemaining).toBe(3)
    expect(result?.requiredMonthlyAgorot).toBe(33334)
  })

  it('treats an already-reached goal as complete regardless of the target date', () => {
    const result = calculateSavingsPace(baseInput({ currentAgorot: 800000, targetAgorot: 800000 }))
    expect(result?.remainingAgorot).toBe(0)
    expect(result?.monthsRemaining).toBe(0)
    expect(result?.requiredMonthlyAgorot).toBe(0)
    expect(result?.isOverdue).toBe(false)
    expect(result?.isOnTrack).toBe(true)
  })

  it('treats a goal that has overshot its target as complete too', () => {
    const result = calculateSavingsPace(baseInput({ currentAgorot: 900000, targetAgorot: 800000 }))
    expect(result?.remainingAgorot).toBe(0)
    expect(result?.isOnTrack).toBe(true)
  })

  it('a goal already complete is never flagged overdue even with a target date in the past', () => {
    const result = calculateSavingsPace(baseInput({ currentAgorot: 800000, targetAgorot: 800000, targetDate: '2020-01-01' }))
    expect(result?.isOverdue).toBe(false)
  })

  it('flags an incomplete goal past its target date as overdue and behind, requiring the full remainder immediately', () => {
    const result = calculateSavingsPace(baseInput({ targetDate: '2026-08-01' }))
    expect(result?.isOverdue).toBe(true)
    expect(result?.isOnTrack).toBe(false)
    expect(result?.monthsRemaining).toBe(0)
    expect(result?.requiredMonthlyAgorot).toBe(600000)
  })

  it('a goal due exactly today (not yet overdue) still gets a 1-month projection', () => {
    const result = calculateSavingsPace(baseInput({ targetDate: '2026-08-22' }))
    expect(result?.isOverdue).toBe(false)
    expect(result?.monthsRemaining).toBe(1)
    expect(result?.requiredMonthlyAgorot).toBe(600000)
  })

  it('floors monthsRemaining at 1 for a deadline later this same month', () => {
    const result = calculateSavingsPace(baseInput({ targetDate: '2026-08-31' }))
    expect(result?.monthsRemaining).toBe(1)
  })

  it('counts exactly one calendar month for a same-day-of-month, one-month-out deadline', () => {
    const result = calculateSavingsPace(baseInput({ today: '2026-08-15', targetDate: '2026-09-15' }))
    expect(result?.monthsRemaining).toBe(1)
  })

  it('handles a multi-year horizon correctly', () => {
    const result = calculateSavingsPace(baseInput({ today: '2026-08-22', targetDate: '2028-02-22' }))
    expect(result?.monthsRemaining).toBe(18)
  })

  it('produces only integer agorot in every numeric field', () => {
    const result = calculateSavingsPace(baseInput({ currentAgorot: 200001, targetAgorot: 800003 }))
    for (const value of [result!.remainingAgorot, result!.requiredMonthlyAgorot]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})
