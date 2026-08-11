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
}

export function filterForAnalytics(
  transactions: readonly AnalyticsTransaction[],
  periodStart: string,
  periodEnd: string
): AnalyticsTransaction[] {
  return transactions.filter(
    (t) => t.isShared && !t.isExcluded && t.txnDate >= periodStart && t.txnDate <= periodEnd
  )
}
