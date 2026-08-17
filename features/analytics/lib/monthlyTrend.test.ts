import { describe, expect, it } from '@jest/globals'
import { computeMonthlyTrend } from './monthlyTrend'
import type { AnalyticsTransaction } from './analyticsTransaction'

describe('computeMonthlyTrend', () => {
  const transactions: AnalyticsTransaction[] = [
    { categoryId: 'c1', amountAgorot: -10000, txnDate: '2026-07-05', isShared: true, isExcluded: false, transferId: null },
    { categoryId: 'c1', amountAgorot: 500000, txnDate: '2026-07-01', isShared: true, isExcluded: false, transferId: null }, // income
    { categoryId: 'c1', amountAgorot: -20000, txnDate: '2026-08-05', isShared: true, isExcluded: false, transferId: null },
    { categoryId: 'c1', amountAgorot: -99999, txnDate: '2026-08-06', isShared: false, isExcluded: false, transferId: null }, // personal, excluded
    { categoryId: 'c1', amountAgorot: -99999, txnDate: '2026-08-07', isShared: true, isExcluded: true, transferId: null }, // is_excluded, excluded
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

  // Migration 008 (ADR-035): a transfer's two legs are real, signed
  // transactions rows that would otherwise inflate BOTH the income and
  // expense side of the same month identically (canceling in net terms but
  // wrong on each side individually) if not excluded by transferId.
  it('excludes both legs of an internal transfer from income and expense entirely', () => {
    const withTransfer: AnalyticsTransaction[] = [
      ...transactions,
      { categoryId: null, amountAgorot: -50000, txnDate: '2026-07-10', isShared: true, isExcluded: false, transferId: 'transfer-1' },
      { categoryId: null, amountAgorot: 50000, txnDate: '2026-07-10', isShared: true, isExcluded: false, transferId: 'transfer-1' },
    ]
    const result = computeMonthlyTrend(withTransfer, ['2026-07-01'])
    expect(result).toEqual([{ periodStart: '2026-07-01', incomeAgorot: 500000, expenseAgorot: 10000 }])
  })
})
