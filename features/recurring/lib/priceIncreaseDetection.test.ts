import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_PRICE_INCREASE_THRESHOLD,
  detectPriceIncreases,
  groupKeyForObservation,
  type RecurringChargeObservation,
} from './priceIncreaseDetection'

// Builds one observation with sensible defaults, overridable per test —
// keeps every test focused on the one or two fields it actually varies.
function obs(overrides: Partial<RecurringChargeObservation> & { id: string; amountAgorot: number; txnDate: string }): RecurringChargeObservation {
  return {
    recurringId: null,
    accountId: 'acc-1',
    description: 'Netflix',
    merchantName: null,
    isExcluded: false,
    ...overrides,
  }
}

describe('detectPriceIncreases', () => {
  it('does not detect a stable price history (Insurance: 450 -> 450 -> 450)', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -45000, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -45000, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -45000, txnDate: '2026-08-01' }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('detects a clear increase (Netflix: 79.90 -> 79.90 -> 79.90 -> 89.90)', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -7990, txnDate: '2026-05-01' }),
      obs({ id: 't2', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 't3', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -7990, txnDate: '2026-07-01' }),
      obs({ id: 't4', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -8990, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]).toMatchObject({
      recurringId: 'rec-1',
      previousAmountAgorot: 7990,
      currentAmountAgorot: 8990,
      increaseAgorot: 1000,
      increasePercent: 12.5,
      detectedAt: '2026-08-01',
      currentTransactionId: 't4',
    })
  })

  it('detects a clear increase (Internet: 99 -> 99 -> 119), matching the exact example wording', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-2', description: 'אינטרנט', amountAgorot: -9900, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-2', description: 'אינטרנט', amountAgorot: -9900, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: 'rec-2', description: 'אינטרנט', amountAgorot: -11900, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]?.increaseAgorot).toBe(2000) // ₪20
    expect(detections[0]?.increasePercent).toBe(20.2) // matches "עלייה של ₪20 (20.2%)"
  })

  it('does not alert on a decrease', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -7900, txnDate: '2026-08-01' }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('suppresses a tiny absolute change below the agorot threshold, even if percent alone would qualify', () => {
    // ₪10.00 -> ₪10.60: 60 agorot / 6% — clears the percent bar, not the absolute one.
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -1000, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -1060, txnDate: '2026-07-01' }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('suppresses a tiny percentage change below the percent threshold, even if absolute alone would qualify', () => {
    // ₪1000.00 -> ₪1006.00: 600 agorot / 0.6% — clears the absolute bar, not the percent one.
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -100000, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -100600, txnDate: '2026-07-01' }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('detects a repeated stable history followed by an increase, using the median of recent prior observations as the baseline', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-03-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-04-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-05-01' }),
      obs({ id: 't4', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-06-01' }),
      obs({ id: 't5', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-07-01' }),
      obs({ id: 't6', recurringId: 'rec-1', amountAgorot: -11900, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]?.previousAmountAgorot).toBe(9900)
    expect(detections[0]?.currentAmountAgorot).toBe(11900)
  })

  it('uses an integer-safe median (floored average) when the prior-observation window has an even count', () => {
    // Prior amounts 9900 and 10100 (within the 6-observation window) -> median would be
    // 10000.0 mathematically; must stay an exact integer, never a float.
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -9900, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -10100, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -12000, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections[0]?.previousAmountAgorot).toBe(10000)
    expect(Number.isInteger(detections[0]!.previousAmountAgorot)).toBe(true)
  })

  it('does not detect from a single transaction — there is no history to compare against', () => {
    const observations = [obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-08-01' })]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('ignores a refund/credit (positive amount_agorot) entirely — it never counts as an expense observation', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-07-01' }),
      // A refund posted as a positive amount — must not become "the newest observation".
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: 7990, txnDate: '2026-07-15' }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('ignores an explicitly excluded transaction', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -50000, txnDate: '2026-08-01', isExcluded: true }),
    ]

    expect(detectPriceIncreases(observations)).toEqual([])
  })

  it('computes correct integer agorot arithmetic for the increase amount', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -33333, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -44444, txnDate: '2026-07-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections[0]?.increaseAgorot).toBe(11111)
    expect(Number.isInteger(detections[0]!.increaseAgorot)).toBe(true)
  })

  it('does not cross-contaminate multiple distinct recurring identities processed together', () => {
    const observations = [
      // rec-1: Netflix, increases
      obs({ id: 'n1', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 'n2', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -7990, txnDate: '2026-07-01' }),
      obs({ id: 'n3', recurringId: 'rec-1', description: 'Netflix', amountAgorot: -8990, txnDate: '2026-08-01' }),
      // rec-2: Insurance, stable
      obs({ id: 'i1', recurringId: 'rec-2', description: 'Insurance', amountAgorot: -45000, txnDate: '2026-06-01' }),
      obs({ id: 'i2', recurringId: 'rec-2', description: 'Insurance', amountAgorot: -45000, txnDate: '2026-07-01' }),
      obs({ id: 'i3', recurringId: 'rec-2', description: 'Insurance', amountAgorot: -45000, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]?.recurringId).toBe('rec-1')
    expect(detections[0]?.currentTransactionId).toBe('n3')
  })

  it('selects the newest transaction correctly regardless of input array order', () => {
    const observations = [
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -8990, txnDate: '2026-08-01' }),
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-07-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections[0]?.currentTransactionId).toBe('t3')
  })

  it('handles a year boundary correctly when selecting the newest observation and computing the baseline', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-11-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-12-01' }),
      obs({ id: 't3', recurringId: 'rec-1', amountAgorot: -8990, txnDate: '2027-01-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]?.currentTransactionId).toBe('t3')
    expect(detections[0]?.detectedAt).toBe('2027-01-01')
  })

  describe('groupKeyForObservation', () => {
    it('prefers recurring_id over any text signal', () => {
      const key = groupKeyForObservation({
        recurringId: 'rec-1',
        merchantName: 'NETFLIX.COM',
        description: 'Some other text',
        accountId: 'acc-1',
      })
      expect(key).toBe('recurring:rec-1')
    })

    it('falls back to normalized merchant_name, scoped to the account, when recurring_id is absent', () => {
      const a = groupKeyForObservation({ recurringId: null, merchantName: '  Netflix.com  ', description: 'x', accountId: 'acc-1' })
      const b = groupKeyForObservation({ recurringId: null, merchantName: 'netflix.com', description: 'y', accountId: 'acc-1' })
      expect(a).toBe(b)
    })

    it('falls back to normalized description when merchant_name is absent', () => {
      const key = groupKeyForObservation({ recurringId: null, merchantName: null, description: '  Netflix  ', accountId: 'acc-1' })
      expect(key).toBe('text:netflix:acc-1')
    })

    it('does not merge the same text across different accounts', () => {
      const a = groupKeyForObservation({ recurringId: null, merchantName: 'Netflix', description: '', accountId: 'acc-1' })
      const b = groupKeyForObservation({ recurringId: null, merchantName: 'Netflix', description: '', accountId: 'acc-2' })
      expect(a).not.toBe(b)
    })

    it('returns null when there is no usable identity signal at all', () => {
      expect(groupKeyForObservation({ recurringId: null, merchantName: null, description: '   ', accountId: null })).toBeNull()
    })
  })

  it('detects a text-grouped (no recurring_id) recurring bill entered manually or via CSV import', () => {
    const observations = [
      obs({ id: 't1', recurringId: null, merchantName: 'ארנונה עירייה', amountAgorot: -180000, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: null, merchantName: 'ארנונה עירייה', amountAgorot: -180000, txnDate: '2026-07-01' }),
      obs({ id: 't3', recurringId: null, merchantName: 'ארנונה עירייה', amountAgorot: -195000, txnDate: '2026-08-01' }),
    ]

    const detections = detectPriceIncreases(observations)
    expect(detections).toHaveLength(1)
    expect(detections[0]?.recurringId).toBeNull()
    expect(detections[0]?.increaseAgorot).toBe(15000)
  })

  it('exposes the default threshold as a tunable, pure exported constant', () => {
    expect(DEFAULT_PRICE_INCREASE_THRESHOLD).toEqual({ minAbsoluteAgorot: 500, minPercent: 5 })
  })

  it('respects a custom threshold passed by the caller', () => {
    const observations = [
      obs({ id: 't1', recurringId: 'rec-1', amountAgorot: -7990, txnDate: '2026-06-01' }),
      obs({ id: 't2', recurringId: 'rec-1', amountAgorot: -8090, txnDate: '2026-07-01' }), // +100 agorot, ~1.25%
    ]

    // Default threshold (500 agorot / 5%) suppresses this.
    expect(detectPriceIncreases(observations)).toEqual([])

    // A looser custom threshold picks it up.
    const detections = detectPriceIncreases(observations, { minAbsoluteAgorot: 50, minPercent: 1 })
    expect(detections).toHaveLength(1)
  })
})
