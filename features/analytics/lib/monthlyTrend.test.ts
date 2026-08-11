import { describe, expect, it } from '@jest/globals'
import { computeMonthlyTrend } from './monthlyTrend'
import type { AnalyticsTransaction } from './analyticsTransaction'

describe('computeMonthlyTrend', () => {
  const transactions: AnalyticsTransaction[] = [
    { categoryId: 'c1', amountAgorot: -10000, txnDate: '2026-07-05', isShared: true, isExcluded: false },
    { categoryId: 'c1', amountAgorot: 500000, txnDate: '2026-07-01', isShared: true, isExcluded: false }, // income
    { categoryId: 'c1', amountAgorot: -20000, txnDate: '2026-08-05', isShared: true, isExcluded: false },
    { categoryId: 'c1', amountAgorot: -99999, txnDate: '2026-08-06', isShared: false, isExcluded: false }, // personal, excluded
    { categoryId: 'c1', amountAgorot: -99999, txnDate: '2026-08-07', isShared: true, isExcluded: true }, // is_excluded, excluded
  ]

  it('buckets income and expenses per requested month, ignoring personal and excluded rows', () => {
    const result = computeMonthlyTrend(transactions, ['2026-07-01', '2026-08-01'])
    expect(result).toEqual([
      { periodStart: '2026-07-01', incomeAgorot: 500000, expenseAgorot: 10000 },
      { periodStart: '2026-08-01', incomeAgorot: 0, expenseAgorot: 20000 },
    ])
  })

  it('returns zero for a month with no matching transactions', () => {
    const result = computeMonthlyTrend(transactions, ['2026-01-01'])
    expect(result).toEqual([{ periodStart: '2026-01-01', incomeAgorot: 0, expenseAgorot: 0 }])
  })
})
