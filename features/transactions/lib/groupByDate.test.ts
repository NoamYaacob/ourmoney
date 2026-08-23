import { describe, expect, it } from '@jest/globals'
import { dateGroupHeading, groupTransactionsByDate } from './groupByDate'
import type { Transaction } from '@/types/app'

function txn(overrides: Partial<Transaction> & { id: string; txn_date: string; amount_agorot: number }): Transaction {
  return {
    household_id: 'h1',
    account_id: 'a1',
    category_id: null,
    description: overrides.id,
    merchant: null,
    is_shared: true,
    is_excluded: false,
    transfer_id: null,
    recurring_id: null,
    installment_plan_id: null,
    installment_index: null,
    paid_by: null,
    created_by: null,
    created_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
    version: 1,
    categorization_source: null,
    category_rule_id: null,
    ...overrides,
  } as Transaction
}

describe('groupTransactionsByDate', () => {
  it('groups by day and puts the newest day first', () => {
    const groups = groupTransactionsByDate([
      txn({ id: 'a', txn_date: '2026-08-20', amount_agorot: -100_00 }),
      txn({ id: 'b', txn_date: '2026-08-21', amount_agorot: -200_00 }),
      txn({ id: 'c', txn_date: '2026-08-20', amount_agorot: -300_00 }),
    ])

    expect(groups.map((group) => group.date)).toEqual(['2026-08-21', '2026-08-20'])
    expect(groups[1]!.transactions).toHaveLength(2)
  })

  it("totals the day's outgoing money", () => {
    const groups = groupTransactionsByDate([
      txn({ id: 'a', txn_date: '2026-08-21', amount_agorot: -412_80 }),
      txn({ id: 'b', txn_date: '2026-08-21', amount_agorot: -96_00 }),
    ])

    expect(groups[0]!.spentAgorot).toBe(508_80)
  })

  it('leaves income out of the day total', () => {
    // A payday would otherwise read as an enormous day of spending.
    const groups = groupTransactionsByDate([
      txn({ id: 'salary', txn_date: '2026-08-21', amount_agorot: 13_950_00 }),
      txn({ id: 'coffee', txn_date: '2026-08-21', amount_agorot: -96_00 }),
    ])

    expect(groups[0]!.spentAgorot).toBe(96_00)
  })

  it("leaves a transfer's legs out of the day total", () => {
    // Moving money to savings is not a day's spending — the same boundary
    // the analytics helpers draw.
    const groups = groupTransactionsByDate([
      txn({ id: 'to-savings', txn_date: '2026-08-20', amount_agorot: -2_000_00, transfer_id: 'tr1' }),
      txn({ id: 'fuel', txn_date: '2026-08-20', amount_agorot: -287_40 }),
    ])

    expect(groups[0]!.spentAgorot).toBe(287_40)
    // The row is still IN the feed — a feed records what happened.
    expect(groups[0]!.transactions).toHaveLength(2)
  })

  it('leaves an excluded transaction out of the day total but keeps the row', () => {
    const groups = groupTransactionsByDate([
      txn({ id: 'excluded', txn_date: '2026-08-20', amount_agorot: -500_00, is_excluded: true }),
      txn({ id: 'fuel', txn_date: '2026-08-20', amount_agorot: -287_40 }),
    ])

    expect(groups[0]!.spentAgorot).toBe(287_40)
    expect(groups[0]!.transactions).toHaveLength(2)
  })

  it('counts a personal transaction in the day total', () => {
    // is_shared is budget attribution only; a feed's day total is not a
    // budget figure, and hiding a personal purchase would make the list
    // disagree with itself.
    const groups = groupTransactionsByDate([
      txn({ id: 'personal', txn_date: '2026-08-20', amount_agorot: -96_00, is_shared: false }),
    ])

    expect(groups[0]!.spentAgorot).toBe(96_00)
  })

  it('reports zero rather than a negative for a day of pure income', () => {
    const groups = groupTransactionsByDate([txn({ id: 'salary', txn_date: '2026-08-21', amount_agorot: 13_950_00 })])
    expect(groups[0]!.spentAgorot).toBe(0)
  })

  it('returns nothing for an empty list', () => {
    expect(groupTransactionsByDate([])).toEqual([])
  })
})

describe('dateGroupHeading', () => {
  it('names today and yesterday', () => {
    expect(dateGroupHeading('2026-08-22', '2026-08-22')).toEqual({ relativeKey: 'today', shortDate: '22.08' })
    expect(dateGroupHeading('2026-08-21', '2026-08-22')).toEqual({ relativeKey: 'yesterday', shortDate: '21.08' })
  })

  it('gives an older day the bare date', () => {
    expect(dateGroupHeading('2026-08-20', '2026-08-22')).toEqual({ relativeKey: null, shortDate: '20.08' })
  })

  it('crosses a month boundary correctly', () => {
    expect(dateGroupHeading('2026-07-31', '2026-08-01')).toEqual({ relativeKey: 'yesterday', shortDate: '31.07' })
  })

  it('crosses a year boundary correctly', () => {
    expect(dateGroupHeading('2025-12-31', '2026-01-01')).toEqual({ relativeKey: 'yesterday', shortDate: '31.12' })
  })

  it('handles a leap day', () => {
    expect(dateGroupHeading('2028-02-29', '2028-03-01')).toEqual({ relativeKey: 'yesterday', shortDate: '29.02' })
  })
})
