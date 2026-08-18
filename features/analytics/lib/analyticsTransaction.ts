// Shared input shape for every analytics calculation in this module —
// callers pre-filter to the relevant household/date window via their own
// query; these pure functions only aggregate. The is_shared/is_excluded
// filter matches the exact convention features/budgets/hooks/
// useBudgetProgress.ts already uses for "what counts" — analytics and
// budget progress answer the same underlying question (what does this
// household's shared spending look like), so they use the same boundary.
export interface AnalyticsTransaction {
  categoryId: string | null
  amountAgorot: number
  txnDate: string // YYYY-MM-DD
  isShared: boolean
  isExcluded: boolean
  // Migration 008 (ADR-035) — non-null on both legs of an internal transfer.
  // Excluded here, at the single choke point every analytics calculation
  // routes through, rather than in each caller: a transfer's legs are real,
  // signed transactions rows (so they'd otherwise pass isShared/isExcluded
  // like any other row) but never represent real income or expense — a
  // transfer inflates both the income and expense side of monthlyTrend
  // identically (canceling in net terms but wrong on each side) if not
  // excluded here.
  transferId: string | null
}

export function filterForAnalytics(
  transactions: readonly AnalyticsTransaction[],
  periodStart: string,
  periodEnd: string
): AnalyticsTransaction[] {
  return transactions.filter(
    (t) =>
      t.isShared &&
      !t.isExcluded &&
      t.transferId === null &&
      t.txnDate >= periodStart &&
      t.txnDate <= periodEnd
  )
}
