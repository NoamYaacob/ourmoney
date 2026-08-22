import { describe, expect, it } from '@jest/globals'
import { computeCurrentCycleSpendAgorot, getCurrentBillingCycleRange } from './creditCardCycle'

describe('getCurrentBillingCycleRange', () => {
  it('when today is before this month\'s closing day, the cycle runs from the day after last month\'s close through this month\'s close', () => {
    const range = getCurrentBillingCycleRange(15, '2026-08-10')
    expect(range).toEqual({ start: '2026-07-16', end: '2026-08-15' })
  })

  it('when today is on or after this month\'s closing day, the cycle runs from the day after this close through next month\'s close', () => {
    const range = getCurrentBillingCycleRange(15, '2026-08-20')
    expect(range).toEqual({ start: '2026-08-16', end: '2026-09-15' })
  })

  it('when today IS the closing day itself, the cycle ends today', () => {
    const range = getCurrentBillingCycleRange(15, '2026-08-15')
    expect(range).toEqual({ start: '2026-07-16', end: '2026-08-15' })
  })

  it('clamps a closing day that overflows a shorter month (e.g. 31 in February)', () => {
    const range = getCurrentBillingCycleRange(31, '2026-02-20')
    expect(range).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  it('handles a year boundary correctly', () => {
    const range = getCurrentBillingCycleRange(15, '2027-01-10')
    expect(range).toEqual({ start: '2026-12-16', end: '2027-01-15' })
  })

  it('handles a leap-year February close correctly', () => {
    const range = getCurrentBillingCycleRange(29, '2028-03-10')
    expect(range).toEqual({ start: '2028-03-01', end: '2028-03-29' })
  })
})

describe('computeCurrentCycleSpendAgorot', () => {
  const range = { start: '2026-08-16', end: '2026-09-15' }

  it('sums expenses within the cycle range', () => {
    const result = computeCurrentCycleSpendAgorot(
      [
        { amount_agorot: -10000, txn_date: '2026-08-20', transfer_id: null },
        { amount_agorot: -5000, txn_date: '2026-09-01', transfer_id: null },
      ],
      range
    )
    expect(result).toBe(15000)
  })

  it('excludes an income (positive) transaction', () => {
    const result = computeCurrentCycleSpendAgorot([{ amount_agorot: 20000, txn_date: '2026-08-20', transfer_id: null }], range)
    expect(result).toBe(0)
  })

  it('excludes a transfer leg (a statement payment, not a purchase) even though it is negative', () => {
    const result = computeCurrentCycleSpendAgorot(
      [{ amount_agorot: -30000, txn_date: '2026-08-20', transfer_id: 'transfer-1' }],
      range
    )
    expect(result).toBe(0)
  })

  it('excludes a transaction outside the cycle range', () => {
    const result = computeCurrentCycleSpendAgorot([{ amount_agorot: -10000, txn_date: '2026-08-01', transfer_id: null }], range)
    expect(result).toBe(0)
  })

  it('includes a transaction exactly on the range boundaries (inclusive)', () => {
    const result = computeCurrentCycleSpendAgorot(
      [
        { amount_agorot: -1000, txn_date: '2026-08-16', transfer_id: null },
        { amount_agorot: -2000, txn_date: '2026-09-15', transfer_id: null },
      ],
      range
    )
    expect(result).toBe(3000)
  })

  it('returns 0 for no transactions', () => {
    expect(computeCurrentCycleSpendAgorot([], range)).toBe(0)
  })
})
