import { describe, expect, it } from '@jest/globals'
import { computeFinancialPulse, type PulseTransactionObservation, type PulsePriceIncreaseObservation } from './computeFinancialPulse'

const txn = (overrides: Partial<PulseTransactionObservation> = {}): PulseTransactionObservation => ({
  id: 'txn-1',
  description: 'חיוב אשראי',
  amountAgorot: -184000,
  txnDate: '2026-08-20',
  isTransfer: false,
  isExcluded: false,
  ...overrides,
})

const increase = (overrides: Partial<PulsePriceIncreaseObservation> = {}): PulsePriceIncreaseObservation => ({
  description: 'Netflix',
  increaseAgorot: 900,
  detectedAt: '2026-08-20',
  ...overrides,
})

describe('computeFinancialPulse — first visit', () => {
  it('returns null when there is no previous snapshot, never a fabricated baseline', () => {
    const result = computeFinancialPulse({
      previousSnapshot: null,
      currentSafeToSpendAgorot: 500000,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [],
    })
    expect(result).toBeNull()
  })
})

describe('computeFinancialPulse — no change', () => {
  it('returns null on exact agorot equality with no secondary items — the calmer omit option', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 500000,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [],
    })
    expect(result).toBeNull()
  })

  it('does NOT omit a real 1-agorot delta — exact comparison, no materiality threshold', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 499999,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [],
    })
    expect(result).not.toBeNull()
    expect(result!.safeToSpendDeltaAgorot).toBe(-1)
  })

  it('still renders when Safe-to-Spend is unchanged but a secondary item exists', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 500000,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [increase()],
    })
    expect(result).not.toBeNull()
    expect(result!.safeToSpendDeltaAgorot).toBe(0)
    expect(result!.cause).toBeNull()
    expect(result!.secondaryItems).toHaveLength(1)
  })
})

describe('computeFinancialPulse — primary delta', () => {
  it('reports a negative delta with previous/current figures intact', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 429800,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [],
    })
    expect(result!.safeToSpendDeltaAgorot).toBe(-62000)
    expect(result!.previousSafeToSpendAgorot).toBe(491800)
    expect(result!.currentSafeToSpendAgorot).toBe(429800)
  })

  it('reports a positive delta with no cause claimed', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 400000, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 450000,
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -1000 })],
      priceIncreases: [],
    })
    expect(result!.safeToSpendDeltaAgorot).toBe(50000)
    expect(result!.cause).toBeNull()
  })
})

describe('computeFinancialPulse — causal explanation', () => {
  it('names the transaction when exactly one new expense exists and its magnitude is within the band of the delta', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 307800, // delta -184000, matches the txn exactly
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -184000, description: 'חיוב אשראי' })],
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'transaction', description: 'חיוב אשראי', amountAgorot: -184000 })
  })

  it('falls back to generic copy when zero new transactions exist since the previous snapshot', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-18T00:00:00Z' },
      currentSafeToSpendAgorot: 307800,
      // Dated BEFORE the previous snapshot — filtered out, so zero candidates remain.
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -184000, txnDate: '2026-08-01' })],
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'generic' })
  })

  it('falls back to generic copy when multiple new expenses exist — no single provable cause', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 307800,
      transactionsSincePreviousCandidate: [
        txn({ id: 'a', amountAgorot: -100000 }),
        txn({ id: 'b', amountAgorot: -84000 }),
      ],
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'generic' })
  })

  it('falls back to generic copy when the lone transaction is far outside the delta band (does not plausibly explain it)', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 307800, // delta -184000
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -5000 })], // way too small to be "the" reason
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'generic' })
  })

  it('never names a transfer as the cause, even if it is the only new row', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 307800,
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -184000, isTransfer: true })],
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'generic' })
  })

  it('never names an excluded transaction as the cause', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' },
      currentSafeToSpendAgorot: 307800,
      transactionsSincePreviousCandidate: [txn({ amountAgorot: -184000, isExcluded: true })],
      priceIncreases: [],
    })
    expect(result!.cause).toEqual({ kind: 'generic' })
  })
})

describe('computeFinancialPulse — secondary items', () => {
  it('filters out price increases detected before the previous snapshot', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-18T00:00:00Z' },
      currentSafeToSpendAgorot: 500000,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [increase({ detectedAt: '2026-08-01' })],
    })
    expect(result).toBeNull()
  })

  it('caps secondary items at 2, even when more exist', () => {
    const result = computeFinancialPulse({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-01T00:00:00Z' },
      currentSafeToSpendAgorot: 500000,
      transactionsSincePreviousCandidate: [],
      priceIncreases: [
        increase({ description: 'Netflix' }),
        increase({ description: 'Spotify' }),
        increase({ description: 'ארנונה' }),
      ],
    })
    expect(result!.secondaryItems).toHaveLength(2)
  })
})
