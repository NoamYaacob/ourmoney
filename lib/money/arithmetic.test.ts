import { describe, expect, it } from '@jest/globals'
import {
  hasReachedThresholdPercent,
  remainingAgorot,
  spentAgorotFromExpenses,
  spentPercent,
  sumAgorot,
} from './arithmetic'

describe('sumAgorot', () => {
  it('sums a list of integers', () => {
    expect(sumAgorot([100, 200, 300])).toBe(600)
  })

  it('returns 0 for an empty list', () => {
    expect(sumAgorot([])).toBe(0)
  })

  it('handles negative and positive together', () => {
    expect(sumAgorot([-500, 200, -100])).toBe(-400)
  })
})

describe('spentAgorotFromExpenses', () => {
  it('negates a sum of negative expense amounts into a positive spent figure', () => {
    // The exact sign-flip bug PROJECT_SPEC.md calls out by name.
    expect(spentAgorotFromExpenses([-1000, -2500, -500])).toBe(4000)
  })

  it('returns a plain 0 for no expenses, never -0 (formatILS(-0) would render a spurious minus sign)', () => {
    expect(spentAgorotFromExpenses([])).toBe(0)
    expect(Object.is(spentAgorotFromExpenses([]), -0)).toBe(false)
  })
})

describe('remainingAgorot', () => {
  it('subtracts spent from allocated', () => {
    expect(remainingAgorot(10000, 4000)).toBe(6000)
  })

  it('goes negative when over budget', () => {
    expect(remainingAgorot(10000, 12000)).toBe(-2000)
  })
})

describe('spentPercent', () => {
  it('computes integer percent via floor division', () => {
    expect(spentPercent(999, 10000)).toBe(9) // 9.99% floors to 9
  })

  it('returns exactly 100 at full spend', () => {
    expect(spentPercent(10000, 10000)).toBe(100)
  })

  it('returns over 100 when over budget', () => {
    expect(spentPercent(15000, 10000)).toBe(150)
  })

  it('returns null for a zero allocation', () => {
    expect(spentPercent(500, 0)).toBeNull()
  })

  it('returns null for a negative allocation', () => {
    expect(spentPercent(500, -100)).toBeNull()
  })

  it('returns 0 for zero spent', () => {
    expect(spentPercent(0, 10000)).toBe(0)
  })
})

describe('hasReachedThresholdPercent', () => {
  it('is false just under the threshold (79.99% vs 80%)', () => {
    expect(hasReachedThresholdPercent(7999, 10000, 80)).toBe(false)
  })

  it('is true exactly at the threshold (exactly 80%)', () => {
    expect(hasReachedThresholdPercent(8000, 10000, 80)).toBe(true)
  })

  it('is false just under 100%', () => {
    expect(hasReachedThresholdPercent(9999, 10000, 100)).toBe(false)
  })

  it('is true at exactly 100%', () => {
    expect(hasReachedThresholdPercent(10000, 10000, 100)).toBe(true)
  })

  it('is true over 100%', () => {
    expect(hasReachedThresholdPercent(15000, 10000, 100)).toBe(true)
  })

  it('is false for a zero allocation regardless of spend', () => {
    expect(hasReachedThresholdPercent(1, 0, 80)).toBe(false)
  })

  it('is false for zero spent against any positive threshold', () => {
    expect(hasReachedThresholdPercent(0, 10000, 80)).toBe(false)
  })

  it('never produces a float-rounding false positive at the boundary', () => {
    // 79.99% of an odd allocation, computed via cross-multiplication, must
    // not round up to "reached" the way a float ratio comparison could.
    expect(hasReachedThresholdPercent(7999, 10001, 80)).toBe(false)
  })
})
