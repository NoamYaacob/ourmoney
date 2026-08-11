import { describe, expect, it } from '@jest/globals'
import { computeCategoryBreakdown } from './categoryBreakdown'
import { computeTopCategories } from './topCategories'
import type { AnalyticsTransaction } from './analyticsTransaction'

const transactions: AnalyticsTransaction[] = [
  { categoryId: 'food', amountAgorot: -10000, txnDate: '2026-08-05', isShared: true, isExcluded: false },
  { categoryId: 'food', amountAgorot: -5000, txnDate: '2026-08-10', isShared: true, isExcluded: false },
  { categoryId: 'transport', amountAgorot: -3000, txnDate: '2026-08-06', isShared: true, isExcluded: false },
  { categoryId: null, amountAgorot: -1000, txnDate: '2026-08-06', isShared: true, isExcluded: false }, // uncategorized, ignored
  { categoryId: 'food', amountAgorot: 20000, txnDate: '2026-08-06', isShared: true, isExcluded: false }, // income, ignored
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
})

describe('computeTopCategories', () => {
  it('ranks categories by spend, descending, limited to N', () => {
    const breakdown = computeCategoryBreakdown(transactions, '2026-08-01')
    const top1 = computeTopCategories(breakdown, 1)
    expect(top1).toEqual([{ categoryId: 'food', spentAgorot: 15000 }])
  })
})
