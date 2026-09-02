import { describe, expect, it } from '@jest/globals'
import { detectCategorySpendAboveTypical, type CategoryMonthObservation } from './detectCategorySpendAboveTypical'

function obs(categoryId: string, spentAgorot: number, categoryNameHe = 'מכולת'): CategoryMonthObservation {
  return { categoryId, categoryNameHe, spentAgorot }
}

describe('detectCategorySpendAboveTypical', () => {
  it('returns nothing when there is no historical window at all', () => {
    expect(detectCategorySpendAboveTypical([obs('cat-1', 50000)], [])).toEqual([])
  })

  it('treats a single prior month as a valid baseline (like priceIncreaseDetection.ts)', () => {
    const detections = detectCategorySpendAboveTypical([obs('cat-1', 50000)], [[obs('cat-1', 20000)]])
    expect(detections).toHaveLength(1)
    expect(detections[0]?.typicalAgorot).toBe(20000)
    expect(detections[0]?.excessAgorot).toBe(30000)
  })

  it('uses the integer-floored median across multiple historical months', () => {
    const detections = detectCategorySpendAboveTypical(
      [obs('cat-1', 60000)],
      [[obs('cat-1', 10000)], [obs('cat-1', 20000)], [obs('cat-1', 30000)]]
    )
    expect(detections[0]?.typicalAgorot).toBe(20000)
  })

  it('treats a category missing from a historical month as zero spend that month, not a skipped month', () => {
    // Two months with real spend, one month with none at all — median of
    // [0, 20000, 22000] = 20000, not median of just [20000, 22000].
    const detections = detectCategorySpendAboveTypical(
      [obs('cat-1', 50000)],
      [[obs('cat-1', 20000)], [obs('cat-1', 22000)], []]
    )
    expect(detections[0]?.typicalAgorot).toBe(20000)
  })

  it('produces no detection when spend is at or below typical', () => {
    expect(detectCategorySpendAboveTypical([obs('cat-1', 18000)], [[obs('cat-1', 20000)]])).toEqual([])
  })

  it('produces no detection when the excess is below the absolute threshold', () => {
    expect(detectCategorySpendAboveTypical([obs('cat-1', 25000)], [[obs('cat-1', 20000)]])).toEqual([])
  })

  it('produces no detection when the excess is below the percent threshold despite a large absolute amount', () => {
    // ₪1,000,000 typical, +₪25,000 excess clears the absolute bar but is only 2.5%.
    expect(detectCategorySpendAboveTypical([obs('cat-1', 1025000)], [[obs('cat-1', 1000000)]])).toEqual([])
  })

  it('never fires when every historical month had zero spend (a zero baseline can never pass the percent bar)', () => {
    expect(detectCategorySpendAboveTypical([obs('cat-1', 50000)], [[], []])).toEqual([])
  })

  it('detects a meaningful excess clearing both thresholds', () => {
    const detections = detectCategorySpendAboveTypical(
      [obs('cat-1', 50000, 'מכולת')],
      [[obs('cat-1', 20000)], [obs('cat-1', 22000)]]
    )
    expect(detections).toHaveLength(1)
    expect(detections[0]?.categoryId).toBe('cat-1')
    expect(detections[0]?.categoryNameHe).toBe('מכולת')
    expect(detections[0]?.currentSpentAgorot).toBe(50000)
    expect(detections[0]?.typicalAgorot).toBe(21000)
    expect(detections[0]?.excessAgorot).toBe(29000)
  })

  it('evaluates each current-month category independently', () => {
    const detections = detectCategorySpendAboveTypical(
      [obs('cat-1', 50000), obs('cat-2', 18000)],
      [[obs('cat-1', 20000), obs('cat-2', 20000)]]
    )
    expect(detections.map((d) => d.categoryId)).toEqual(['cat-1'])
  })

  it('ignores a category with no current-month spend entirely (nothing to compare)', () => {
    const detections = detectCategorySpendAboveTypical([], [[obs('cat-1', 20000)]])
    expect(detections).toEqual([])
  })
})
