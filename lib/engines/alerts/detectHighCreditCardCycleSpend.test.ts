import { describe, expect, it } from '@jest/globals'
import { detectHighCreditCardCycleSpend, type CreditCardCycleAccountInput } from './detectHighCreditCardCycleSpend'

const TODAY = '2026-08-16'

function account(overrides: Partial<CreditCardCycleAccountInput> = {}): CreditCardCycleAccountInput {
  return {
    accountId: 'acc-1',
    accountName: 'ויזה',
    billingCycleDay: 10,
    transactions: [],
    ...overrides,
  }
}

describe('detectHighCreditCardCycleSpend', () => {
  it('returns null when there is no previous-cycle spend at all (no baseline)', () => {
    const result = detectHighCreditCardCycleSpend(
      account({ transactions: [{ amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null }] }),
      TODAY
    )
    expect(result).toBeNull()
  })

  it('returns null when current spend has not yet exceeded the previous cycle', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -50000, txn_date: '2026-08-12', transfer_id: null },
        ],
      }),
      TODAY
    )
    expect(result).toBeNull()
  })

  it('returns null when the excess is below the absolute threshold', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -105000, txn_date: '2026-08-12', transfer_id: null }, // +₪50, +5%
        ],
      }),
      TODAY
    )
    expect(result).toBeNull()
  })

  it('returns null when the excess is below the percent threshold despite a large absolute amount', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -1000000, txn_date: '2026-07-20', transfer_id: null }, // ₪10,000
          { amount_agorot: -1035000, txn_date: '2026-08-12', transfer_id: null }, // +₪350, +3.5%
        ],
      }),
      TODAY
    )
    expect(result).toBeNull()
  })

  it('detects a meaningful excess clearing both thresholds', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null },
        ],
      }),
      TODAY
    )
    expect(result).not.toBeNull()
    expect(result?.currentCycleSpendAgorot).toBe(140000)
    expect(result?.previousCycleSpendAgorot).toBe(100000)
    expect(result?.excessAgorot).toBe(40000)
    expect(result?.excessPercent).toBe(40)
    expect(result?.currentCycleEnd).toBe('2026-09-10')
  })

  it('excludes transfer legs from both cycle totals (a statement payment is not spend)', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null },
          { amount_agorot: 300000, txn_date: '2026-08-12', transfer_id: 'transfer-1' }, // statement payment
        ],
      }),
      TODAY
    )
    expect(result?.currentCycleSpendAgorot).toBe(140000)
  })

  it('excludes income-signed rows from both cycle totals', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -100000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -140000, txn_date: '2026-08-12', transfer_id: null },
          { amount_agorot: 5000, txn_date: '2026-08-12', transfer_id: null }, // a refund/credit
        ],
      }),
      TODAY
    )
    expect(result?.currentCycleSpendAgorot).toBe(140000)
  })

  it('never fires on a decrease from the previous cycle', () => {
    const result = detectHighCreditCardCycleSpend(
      account({
        transactions: [
          { amount_agorot: -200000, txn_date: '2026-07-20', transfer_id: null },
          { amount_agorot: -100000, txn_date: '2026-08-12', transfer_id: null },
        ],
      }),
      TODAY
    )
    expect(result).toBeNull()
  })
})
