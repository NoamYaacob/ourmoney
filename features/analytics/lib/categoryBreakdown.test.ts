import { describe, expect, it } from '@jest/globals'
import { computeCategoryBreakdown } from './categoryBreakdown'
import { computeTopCategories } from './topCategories'
import type { AnalyticsTransaction } from './analyticsTransaction'

const transactions: AnalyticsTransaction[] = [
  { categoryId: 'food', amountAgorot: -10000, txnDate: '2026-08-05', isShared: true, isExcluded: false, transferId: null },
  { categoryId: 'food', amountAgorot: -5000, txnDate: '2026-08-10', isShared: true, isExcluded: false, transferId: null },
  { categoryId: 'transport', amountAgorot: -3000, txnDate: '2026-08-06', isShared: true, isExcluded: false, transferId: null },
  { categoryId: null, amountAgorot: -1000, txnDate: '2026-08-06', isShared: true, isExcluded: false, transferId: null }, // uncategorized, ignored
  { categoryId: 'food', amountAgorot: 20000, txnDate: '2026-08-06', isShared: true, isExcluded: false, transferId: null }, // income, ignored
]

describe('computeCategoryBreakdown', () => {
  it('sums expenses per category within the month, excluding uncategorized and income rows', () => {
    const result = computeCategoryBreakdown(transactions, '2026-08-01')
    expect(result).toEqual(
      expect.arrayContaining([
        { categoryId: 'food', spentAgorot: 15000 },
        { categoryId: 'transport', spentAgorot: 3000 },
      ])
    )
    expect(result).toHaveLength(2)
  })

  // Migration 008 (ADR-035): a transfer leg always has categoryId null, so
  // it would already be excluded by the existing categoryId !== null filter
  // — this test pins that as an explicit, intentional guarantee (not an
  // accident of the CHECK constraint) rather than leaving it unproven.
  it('excludes a transfer leg even though its category_id-null shape matches the uncategorized case', () => {
    const withTransfer: AnalyticsTransaction[] = [
      ...transactions,
      { categoryId: null, amountAgorot: -50000, txnDate: '2026-08-12', isShared: true, isExcluded: false, transferId: 'transfer-1' },
    ]
    const result = computeCategoryBreakdown(withTransfer, '2026-08-01')
    expect(result).toEqual(
      expect.arrayContaining([
        { categoryId: 'food', spentAgorot: 15000 },
        { categoryId: 'transport', spentAgorot: 3000 },
      ])
    )
    expect(result).toHaveLength(2)
  })
})

describe('computeTopCategories', () => {
  it('ranks categories by spend, descending, limited to N', () => {
    const breakdown = computeCategoryBreakdown(transactions, '2026-08-01')
    const top1 = computeTopCategories(breakdown, 1)
    expect(top1).toEqual([{ categoryId: 'food', spentAgorot: 15000 }])
  })
})
