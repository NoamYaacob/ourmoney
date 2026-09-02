import { describe, expect, it } from '@jest/globals'
import { computeBalanceAxisRange } from './balanceAxisRange'

describe('computeBalanceAxisRange', () => {
  it('anchors to zero (safety-first) when the balance dips close to zero, even while staying positive', () => {
    const result = computeBalanceAxisRange([50_000, 10_000, 30_000])
    expect(result.showZeroReference).toBe(true)
    expect(result.minBalance).toBeLessThanOrEqual(0)
  })

  it('compresses away from zero when the balance stays comfortably clear of it', () => {
    const result = computeBalanceAxisRange([10_061_875, 8_600_000, 8_322_695])
    expect(result.showZeroReference).toBe(false)
    expect(result.minBalance).toBeGreaterThan(0)
  })

  it('anchors to zero whenever any balance is actually negative', () => {
    const result = computeBalanceAxisRange([500_000, -61_200, 470_000])
    expect(result.showZeroReference).toBe(true)
    expect(result.minBalance).toBeLessThanOrEqual(-61_200)
  })

  it('never produces a zero or negative range (no division-by-zero downstream)', () => {
    const flat = computeBalanceAxisRange([0, 0])
    expect(flat.range).toBeGreaterThan(0)
    const single = computeBalanceAxisRange([500_000])
    expect(single.range).toBeGreaterThan(0)
  })
})
